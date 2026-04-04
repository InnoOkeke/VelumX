import {
    makeContractCall,
    broadcastTransaction,
    AnchorMode,
    PostConditionMode,
    uintCV,
    principalCV,
    someCV,
    noneCV,
    bufferCV,
    listCV,
    deserializeTransaction,
    sponsorTransaction,
} from '@stacks/transactions';
import { StacksNetwork, STACKS_MAINNET, STACKS_TESTNET } from '@stacks/network';
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

// Simple interface matching the SDK
interface SignedIntent {
    target: string;
    payload: string; // Packed transaction buffer
    maxFeeUSDCx: string | number;
    nonce: string | number;
    signature: string;
    network?: 'mainnet' | 'testnet'; // Optional network flag
}

export class PaymasterService {
    private mainnetNetwork: StacksNetwork;
    private testnetNetwork: StacksNetwork;
    private relayerKey: string;

    constructor() {
        this.mainnetNetwork = STACKS_MAINNET;
        this.testnetNetwork = STACKS_TESTNET;
        const rawKey = (process.env.RELAYER_PRIVATE_KEY || '').trim();
        this.relayerKey = this.sanitizePrivateKey(rawKey);

        if (!this.relayerKey) {
            console.warn("WARNING: RELAYER_PRIVATE_KEY not set. Sponsorship will fail.");
        } else {
            console.log("Relayer Key initialized and sanitized.");
        }
    }

    /**
     * Get the correct Paymaster contract address for the target network
     */
    public getPaymasterAddress(network: 'mainnet' | 'testnet'): string {
        if (network === 'mainnet') {
            return process.env.PAYMASTER_CONTRACT_MAINNET || 'SPKYNF473GQ1V0WWCF24TV7ZR1WYAKTC7AM8QGBW.simple-paymaster-v1';
        }
        return process.env.PAYMASTER_CONTRACT_TESTNET || 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.simple-paymaster-v1';
    }

    /**
     * Get the correct USDCx token address for the target network
     */
    public getUsdcxAddress(network: 'mainnet' | 'testnet'): string {
        if (network === 'mainnet') {
            return process.env.USDCX_TOKEN_MAINNET || 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx';
        }
        return process.env.USDCX_TOKEN_TESTNET || 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx';
    }

    private sanitizePrivateKey(key: string): string {
        if (!key) return '';
        // Remove 0x prefix if present
        let sanitized = key.startsWith('0x') ? key.substring(2) : key;

        // Stacks/Bitcoin private keys are typically 32 bytes (64 hex chars)
        // or 33 bytes (66 hex chars) where the last byte is 01 to indicate compression.
        if (sanitized.length === 64) {
            console.log("Relayer: Appending mandatory compression suffix '01' to 32-byte key.");
            sanitized += '01';
        } else if (sanitized.length === 66) {
            const suffix = sanitized.substring(64);
            if (suffix !== '01') {
                console.warn(`Relayer: Key is 33 bytes but suffix is '${suffix}' instead of '01'. Forcing '01' for Stacks compatibility.`);
                sanitized = sanitized.substring(0, 64) + '01';
            }
        } else if (sanitized.length !== 66) {
            console.error(`Relayer: Private key has unconventional length (${sanitized.length}). Stacks expects 64 or 66 chars.`);
        }

        return sanitized;
    }

    /**
     * Deterministically derive a unique relayer key for a specific developer
     * based on their Supabase User ID and the Relayer's Master Key.
     */
    public getUserRelayerKey(userId: string): string {
        if (!this.relayerKey) throw new Error("Relayer master key not configured");
        if (!userId) throw new Error("User ID required for key derivation");

        // Create a deterministic sub-key using HMAC-SHA256
        const hmac = crypto.createHmac('sha256', Buffer.from(this.relayerKey, 'hex'));
        hmac.update(userId);
        const derivedBuffer = hmac.digest();

        // Ensure it's 33 bytes for Stacks (compressed)
        let derivedHex = derivedBuffer.toString('hex');
        if (derivedHex.length === 64) derivedHex += '01';

        return derivedHex;
    }

    /**
     * Get real-time STX/USD price from CoinGecko
     */
    private async getCurrentStxPrice(): Promise<number> {
        try {
            // Using a simple fetch for the STX price (Blockstack ID on CoinGecko)
            const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=blockstack&vs_currencies=usd');
            if (response.ok) {
                const data = await response.json();
                return data.blockstack.usd;
            }
            throw new Error(`Price API status: ${response.status}`);
        } catch (error) {
            console.warn("Relayer: Failed to fetch STX price, using fallback $2.50", error);
            // Dynamic fallback can also be sourced from environment
            return 2.50; 
        }
    }

    /**
     * Estimate real USDCx fee for a transaction intent
     */
    public async estimateFee(intent: any, apiKeyId: string) {
        if (!apiKeyId) throw new Error("API key identity required for estimation");

        // 1. Fetch Developer Settings (Multi-tenant context)
        const apiKey = await (prisma.apiKey as any).findUnique({
            where: { id: apiKeyId },
            select: { 
                sponsorshipPolicy: true, 
                markupPercentage: true, 
                maxSponsoredTxsPerUser: true 
            }
        }) as any; 

        if (!apiKey) throw new Error("Developer context not found");

        // 2. Determine User Address (Who is being sponsored?)
        const userAddress = intent.target || 'unknown';

        // 3. Handle 'Developer Sponsors' Policy
        if ((apiKey.sponsorshipPolicy as string) === 'DEVELOPER_SPONSORS') {
            // Check Monthly sponsorship limit for this specific userAddress
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

            const sponsoredCount = await prisma.transaction.count({
                where: {
                    apiKeyId,
                    userAddress,
                    createdAt: { gte: startOfMonth },
                    // Count transactions where the relayer sponsored the gas
                    type: { contains: 'Sponsorship' },
                    status: { notIn: ['Failed'] }
                }
            });

            // If under the limit (e.g. 5 free per month), return 0 fee
            if (sponsoredCount < apiKey.maxSponsoredTxsPerUser) {
                return {
                    maxFeeUSDCx: "0",
                    estimatedGas: intent.estimatedGas || 5000,
                    policy: "DEVELOPER_SPONSORS",
                    remainingFreeInRange: apiKey.maxSponsoredTxsPerUser - sponsoredCount
                };
            }
            
            console.log(`Relayer: User ${userAddress} hit monthly limit (${sponsoredCount}/${apiKey.maxSponsoredTxsPerUser}). Falling back to USER_PAYS.`);
        }

        // 4. Handle 'User Pays' or Fallback (Dynamic Calculation)
        
        // Fetch current market conditions
        const stxPrice = await this.getCurrentStxPrice();
        const estimatedGas = intent.estimatedGas || 7000; // Base gas + buffer
        
        // Stacks Fee Logic:
        // microSTX = gas * gasPrice
        // In current mainnet, 1000 microSTX is a safe "average" gas price per unit for sponsorship
        const SAFE_GAS_PRICE = 1; // 1 microSTX per gas unit
        const networkFeeMicroSTX = estimatedGas * SAFE_GAS_PRICE;
        
        // Conversion:
        // USDCx has 6 decimals, same as microSTX (1 STX = 1e6 microSTX)
        // Fee = microSTX_Cost * STX_USD_PRICE * (1 + markup%)
        const markupFactor = 1 + (apiKey.markupPercentage / 100);
        const finalUsdcxFee = Math.ceil(networkFeeMicroSTX * stxPrice * markupFactor);

        return {
            maxFeeUSDCx: finalUsdcxFee.toString(),
            estimatedGas,
            policy: "USER_PAYS",
            reason: (apiKey.sponsorshipPolicy as string) === 'USER_PAYS' ? "Developer policy: User Pays" : "Monthly sponsorship limit reached"
        };
    }

    public async sponsorIntent(intent: SignedIntent, apiKeyId?: string, userId?: string) {
        // Use user-specific key if userId is provided, otherwise fallback to master (legacy/admin)
        const activeKey = userId ? this.getUserRelayerKey(userId) : this.relayerKey;

        if (!activeKey) throw new Error("Relayer key not configured");

        console.log("Relayer: Processing account-abstraction intent", {
            target: intent.target,
            nonce: intent.nonce,
            maxFee: intent.maxFeeUSDCx,
            tenant: userId || 'MASTER'
        });

        const targetNetwork = intent.network || (process.env.NETWORK as 'mainnet' | 'testnet') || 'mainnet';
        const stxNetwork = targetNetwork === 'mainnet' ? this.mainnetNetwork : this.testnetNetwork;
        const paymasterAddress = this.getPaymasterAddress(targetNetwork);
        const [contractAddress, contractName] = paymasterAddress.split('.');
        const usdcxToken = this.getUsdcxAddress(targetNetwork);

        const txOptions = {
            contractAddress,
            contractName,
            functionName: 'execute-gasless',
            functionArgs: [
                principalCV(intent.target),
                bufferCV(Buffer.from(intent.payload.replace(/^0x/, ''), 'hex')), // Actual user signed payload
                uintCV(intent.maxFeeUSDCx),
                uintCV(intent.nonce),
                bufferCV(Buffer.from(intent.signature.replace(/^0x/, ''), 'hex')),
                principalCV(usdcxToken)
            ],
            senderKey: activeKey,
            validateWithAbi: false,
            network: stxNetwork,
            anchorMode: AnchorMode.Any,
            postConditionMode: PostConditionMode.Allow,
            fee: 1000n, // 0.001 STX (microSTX)
        };

        try {
            const transaction = await makeContractCall(txOptions);
            const response = await broadcastTransaction({ transaction, network: stxNetwork });

            if ('error' in response) {
                const errorMsg = response.reason || (response as any).message || JSON.stringify(response);
                throw new Error(`Intent broadcast failed: ${errorMsg}`);
            }

            const txid = response.txid;

            // Save to Database with Multi-tenant association
            try {
                await (prisma.transaction as any).create({
                    data: {
                        txid,
                        type: 'Intent Sponsorship',
                        userAddress: intent.target,
                        feeAmount: intent.maxFeeUSDCx.toString(),
                        status: 'Pending',
                        network: targetNetwork, // Accurately log the network
                        userId: userId || null,
                        apiKeyId: apiKeyId || null
                    }
                });
            } catch (dbError) {
                console.error("Failed to save transaction to DB:", dbError);
            }

            return { txid, status: "sponsored" };
        } catch (error: any) {
            console.error("Relayer: Intent sponsorship error", error);
            throw error;
        }
    }

    /**
     * Sponsor a raw Stacks transaction hex
     */
    public async sponsorRawTransaction(txHex: string, apiKeyId: string, userId: string, reportedFee?: string) {
        const activeKey = userId ? this.getUserRelayerKey(userId) : this.relayerKey;
        if (!activeKey) throw new Error("Relayer key not configured");

        try {
            const cleanHex = txHex.replace(/^0x/, '');
            const transaction = deserializeTransaction(cleanHex);

            // Introspect: Try to find real address and fee
            let userAddress = 'unknown';
            let feeAmount = '0';

            try {
                // Sender address: Use a more resilient way to find the signer's address
                const auth = transaction.auth as any;
                if (auth.originAddress) {
                    userAddress = auth.originAddress;
                } else if (auth.spendingCondition && auth.spendingCondition.signer) {
                    userAddress = auth.spendingCondition.signer;
                }

                // Fee Amount Introspection: Try to detect which function was called
                if (transaction.payload.payloadType === 2) { // 2 = ContractCall (matches stacks-transactions)
                    const payload = transaction.payload as any;
                    const functionName = payload.functionName;
                    const args = payload.functionArgs;

                    console.log(`Relayer: Introspecting fee for ${functionName}...`);

                    if (args && args.length > 0) {
                        let feeIndex = -1;
                        if (functionName === 'bridge-gasless') feeIndex = 2;
                        else if (functionName === 'swap-gasless') feeIndex = 4;
                        else if (functionName === 'transfer-gasless') feeIndex = 3;
                        else if (functionName === 'execute-gasless') feeIndex = 3;

                        if (feeIndex !== -1 && args[feeIndex] && args[feeIndex].type === 1) { // 1 = uint
                            feeAmount = args[feeIndex].value.toString();
                            console.log(`Relayer: Successfully extracted fee ${feeAmount} from ${functionName}.`);
                        }
                    }
                }

                // Final Fallback: If introspection failed but SDK reported a fee, use it
                if ((feeAmount === '0' || !feeAmount) && reportedFee) {
                    feeAmount = reportedFee;
                    console.log(`Relayer: Using reportedFee fallback: ${feeAmount}`);
                }
            } catch (introError) {
                console.warn("Relayer: Failed to introspect txHex", introError);
            }

            // Detect network from transaction version (0.00 = Mainnet, 0.80 = Testnet)
            const targetNetwork = (transaction as any).version === 0x00 ? 'mainnet' : 'testnet';
            const stxNetwork = targetNetwork === 'mainnet' ? this.mainnetNetwork : this.testnetNetwork;

            // Sign as sponsor
            const RELAYER_FEE = 1000n; // 0.001 STX (microSTX)

            const signedTx = await sponsorTransaction({
                transaction,
                sponsorPrivateKey: activeKey,
                network: stxNetwork,
                fee: RELAYER_FEE,
            });

            // Broadcast
            const response = await broadcastTransaction({ transaction: signedTx, network: stxNetwork });

            if ('error' in response) {
                const errorMsg = response.reason || (response as any).message || JSON.stringify(response);
                throw new Error(`Broadcast failed: ${errorMsg}`);
            }

            const txid = response.txid;

            // Save to Database
            try {
                await (prisma.transaction as any).create({
                    data: {
                        txid: txid,
                        type: 'Native Sponsorship',
                        userAddress,
                        feeAmount,
                        status: 'Pending',
                        network: targetNetwork, // Accurately log the network
                        userId: userId || null,
                        apiKeyId: apiKeyId || null
                    }
                });
            } catch (e) {
                console.error("DB Save Error in sponsorRawTransaction:", e);
            }

            return {
                txid: txid,
                status: "sponsored"
            };
        } catch (error: any) {
            console.error("Native Sponsorship Error:", error);
            throw error;
        }
    }
}
