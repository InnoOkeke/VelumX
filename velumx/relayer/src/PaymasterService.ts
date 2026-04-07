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
    Cl,
    getAddressFromPrivateKey,
} from '@stacks/transactions';
import { StacksNetwork, STACKS_MAINNET, STACKS_TESTNET } from '@stacks/network';
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import { PricingOracleService } from './services/PricingOracleService.js';

const prisma = new PrismaClient();

// Simple interface matching the SDK
interface SignedIntent {
    target: string;
    payload: string; // Packed transaction buffer
    maxFee: string | number;
    feeToken?: string; // New: Supports Universal Token Gas
    nonce: string | number;
    signature: string;
    network?: 'mainnet' | 'testnet'; // Optional network flag
}

export class PaymasterService {
    private mainnetNetwork: StacksNetwork;
    private testnetNetwork: StacksNetwork;
    private relayerKey: string;
    private pricingOracle: PricingOracleService;

    constructor() {
        this.mainnetNetwork = STACKS_MAINNET;
        this.testnetNetwork = STACKS_TESTNET;
        this.pricingOracle = new PricingOracleService();
        const rawKey = (process.env.RELAYER_PRIVATE_KEY || '').trim();
        this.relayerKey = this.sanitizePrivateKey(rawKey);

        if (!this.relayerKey) {
            console.warn("WARNING: RELAYER_PRIVATE_KEY not set. Sponsorship will fail.");
        } else {
            console.log("Relayer Key initialized and sanitized for Universal Gas.");
        }
    }

    /**
     * Get the correct Paymaster contract address for the target network
     */
    public getPaymasterAddress(network: 'mainnet' | 'testnet'): string {
        // Strict mapping to network-specific environment variables
        if (network === 'mainnet') {
            return process.env.PAYMASTER_CONTRACT_MAINNET || 'SPKYNF473GQ1V0WWCF24TV7ZR1WYAKTC7AM8QGBW.universal-paymaster-v1';
        }
        return process.env.PAYMASTER_CONTRACT_TESTNET || 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.universal-paymaster-v1';
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

        try {
            // 1. Get the RAW 32-byte seed (remove any 01 suffix from the master key for derivation)
            const masterSeed = this.relayerKey.length === 66 ? this.relayerKey.substring(0, 64) : this.relayerKey;

            // 2. Derive a deterministic 32-byte sub-key using HMAC-SHA256
            const hmac = crypto.createHmac('sha256', Buffer.from(masterSeed, 'hex'));
            hmac.update(userId);
            const subKey = hmac.digest('hex');

            // 3. SECP256K1 Validation & Compression Suffix
            // We append '01' to indicate this is a compressed public key, which Stacks requires.
            return subKey + '01';
        } catch (error) {
            console.error(`Relayer: Failed to derive key for user ${userId}`, error);
            throw new Error("Multi-tenant key derivation failed");
        }
    }

    /**
     * Get real-time Price for a specific token relative to microSTX using multiple oracles
     * Returns: Amount of STX per 1 unit of token
     */
    public async getTokenRate(token: string): Promise<number> {
        return this.pricingOracle.getTokenRate(token);
    }

    /**
     * Get the current STX price in USD/USDCx using multiple oracles
     */
    public async getStxPrice(): Promise<number> {
        return this.pricingOracle.getStxPrice();
    }

    /**
     * Convert any token amount to its USDCx (USD) equivalent
     */
    public async convertToUsdcx(amount: string | bigint, token: string): Promise<number> {
        return this.pricingOracle.convertToUsdcx(amount, token);
    }

    /**
     * Estimate Universal fee for a transaction intent
     */
    public async estimateFee(intent: any, apiKeyId: string) {
        if (!apiKeyId) throw new Error("API key identity required for estimation");

        const apiKey = await (prisma.apiKey as any).findUnique({
            where: { id: apiKeyId },
            select: {
                sponsorshipPolicy: true,
                markupPercentage: true,
                maxSponsoredTxsPerUser: true,
                monthlyLimitUsd: true,
                supportedGasTokens: true
            }
        }) as any;

        if (!apiKey) throw new Error("Developer context not found");

        const userAddress = intent.target || 'unknown';
        const feeToken = intent.feeToken;

        // 1. Sponsorship Policy Check (Developer Pays) — check FIRST before any token validation
        if ((apiKey.sponsorshipPolicy as string) === 'DEVELOPER_SPONSORS') {
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

            const monthlyTransactions = await prisma.transaction.findMany({
                where: {
                    apiKeyId,
                    createdAt: { gte: startOfMonth },
                    status: { notIn: ['Failed'] }
                },
                select: { feeAmount: true }
            });

            const totalMonthlySpend = monthlyTransactions.reduce((acc, tx) => {
                return acc + BigInt(tx.feeAmount || '0');
            }, BigInt(0));

            if (totalMonthlySpend < BigInt(100_000_000)) {
                const sponsoredCount = await prisma.transaction.count({
                    where: {
                        apiKeyId,
                        userAddress,
                        createdAt: { gte: startOfMonth },
                        status: { notIn: ['Failed'] }
                    }
                });

                if (sponsoredCount < apiKey.maxSponsoredTxsPerUser) {
                    // Developer sponsors — user pays nothing, skip all token checks
                    return {
                        maxFee: "0",
                        feeToken: feeToken || 'STX',
                        estimatedGas: intent.estimatedGas || 10000,
                        policy: "DEVELOPER_SPONSORS"
                    };
                }
            }
        }

        // 2. Token validation only applies when user pays
        if (!feeToken) {
            throw new Error("Universal Gas: Please specify a feeToken contract principal.");
        }

        const supportedTokens = apiKey.supportedGasTokens || [];
        if (supportedTokens.length > 0 && !supportedTokens.includes(feeToken)) {
            throw new Error(`Gas token ${feeToken} is not supported by this developer's policy.`);
        }

        // 3. Universal Pricing (User Pays)
        const tokenRate = await this.getTokenRate(feeToken);
        const estimatedGas = intent.estimatedGas || 10000;
        const SAFE_GAS_PRICE = 1;
        const networkFeeMicroSTX = estimatedGas * SAFE_GAS_PRICE;

        const markupFactor = 1 + (apiKey.markupPercentage / 100);

        const finalFee = Math.ceil(networkFeeMicroSTX / tokenRate * markupFactor);

        return {
            maxFee: finalFee.toString(),
            feeToken,
            estimatedGas,
            policy: "USER_PAYS"
        };
    }

    public async sponsorIntent(intent: SignedIntent, apiKeyId?: string, userId?: string) {
        const activeKey = userId ? this.getUserRelayerKey(userId) : this.relayerKey;

        if (!activeKey) throw new Error("Relayer key not configured");
        if (!intent.feeToken) throw new Error("Universal Gas: feeToken is required");

        console.log("Relayer: Processing account-abstraction intent", {
            target: intent.target,
            token: intent.feeToken,
            tenant: userId || 'MASTER'
        });

        const targetNetwork = intent.network || (process.env.NETWORK as 'mainnet' | 'testnet') || 'mainnet';
        const stxNetwork = targetNetwork === 'mainnet' ? this.mainnetNetwork : this.testnetNetwork;
        const paymasterAddress = this.getPaymasterAddress(targetNetwork);
        const [contractAddress, contractName] = paymasterAddress.split('.');

        const feeTokenPrincipal = intent.feeToken;

        const txOptions = {
            contractAddress,
            contractName,
            functionName: 'call-gasless',
            functionArgs: [
                principalCV(feeTokenPrincipal),
                uintCV(intent.maxFee),
                principalCV(getAddressFromPrivateKey(activeKey, targetNetwork)), // Dynamic Relayer receiver
                principalCV(intent.target),
                Cl.stringAscii('universal-execute'),
                bufferCV(Buffer.from(intent.payload.replace(/^0x/, ''), 'hex'))
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
                        feeAmount: intent.maxFee.toString(),
                        feeToken: intent.feeToken || 'Token',
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
                        let tokenIndex = -1;

                        if (functionName === 'call-gasless') {
                            tokenIndex = 0;
                            feeIndex = 1;
                        } else if (functionName === 'bridge-gasless' || functionName === 'bridge-tokens') feeIndex = 2;
                        else if (functionName === 'swap-gasless' || functionName === 'swap-v1') feeIndex = 4;
                        else if (functionName === 'transfer-gasless' || functionName === 'transfer') feeIndex = 3;

                        // Extract Fee Amount
                        if (feeIndex !== -1 && args[feeIndex] && args[feeIndex].type === 1) { // 1 = uint
                            feeAmount = args[feeIndex].value.toString();
                            console.log(`Relayer: Successfully extracted fee ${feeAmount} from ${functionName}.`);
                        }

                        // Extract Fee Token
                        if (tokenIndex !== -1 && args[tokenIndex] && args[tokenIndex].type === 6) { // 6 = Principal
                            const tokenPrincipal = args[tokenIndex].value.toString();
                            const ticker = tokenPrincipal.split('.').pop() || 'FT';
                            console.log(`Relayer: Detected fee token ${ticker} in universal call.`);
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
                        feeToken: reportedFee?.includes('.') ? reportedFee.split('.').pop() || 'Token' : 'Token',
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
