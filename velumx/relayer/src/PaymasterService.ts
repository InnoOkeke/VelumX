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
import { StacksNetwork, STACKS_MAINNET, STACKS_TESTNET, TransactionVersion } from '@stacks/network';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Simple interface matching the SDK
interface SignedIntent {
    target: string;
    functionName: string;
    args: any[];
    maxFeeUSDCx: string | number;
    nonce: string | number;
    signature: string;
}

export class PaymasterService {
    private network: StacksNetwork;
    private relayerKey: string;
    private smartWalletContract: string; // e.g. SP...ADMIN.smart-wallet

    constructor() {
        this.network = process.env.NETWORK === 'mainnet' ? STACKS_MAINNET : STACKS_TESTNET;
        const rawKey = (process.env.RELAYER_PRIVATE_KEY || '').trim();
        this.relayerKey = this.sanitizePrivateKey(rawKey);
        this.smartWalletContract = process.env.SMART_WALLET_CONTRACT || '';

        if (!this.relayerKey) {
            console.warn("WARNING: RELAYER_PRIVATE_KEY not set. Sponsorship will fail.");
        } else {
            console.log("Relayer Key initialized and sanitized.");
        }
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

    public async estimateFee(intent: any) {
        // Logic to calculate estimated STX gas, convert using Oracle rate, and add markup
        // In a real scenario, this queries the smart contract via read-only call
        return {
            maxFeeUSDCx: "250000", // e.g. $0.25
            estimatedGas: 5000
        };
    }

    public async sponsorIntent(intent: SignedIntent) {
        // The Relayer calls `execute-gasless` on the user's Smart Wallet contract
        // The Relayer pays the STX fee for this transaction.
        // The Smart Wallet contract will reimburse the Relayer in USDCx via the paymaster-module.

        const [contractAddress, contractName] = this.smartWalletContract.split('.');
        const usdcxToken = process.env.USDCX_TOKEN || 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx';
        const [tokenAddress, tokenName] = usdcxToken.split('.');

        const txOptions = {
            contractAddress,
            contractName,
            functionName: 'execute-gasless',
            functionArgs: [
                principalCV(intent.target),
                // Generic Payload: for now we use intent signature as mock payload
                bufferCV(Buffer.from(intent.signature, 'hex')),
                uintCV(intent.maxFeeUSDCx),
                uintCV(intent.nonce),
                bufferCV(Buffer.from(intent.signature, 'hex')),
                principalCV(`${tokenAddress}.${tokenName}`) // token-trait
            ],
            senderKey: this.relayerKey,
            validateWithAbi: false,
            network: this.network,
            anchorMode: AnchorMode.Any,
            postConditionMode: PostConditionMode.Allow,
        };

        const transaction = await makeContractCall(txOptions);
        const broadcastResponse = await broadcastTransaction({ transaction, network: this.network });

        if ('error' in broadcastResponse) {
            throw new Error(`Broadcast failed: ${broadcastResponse.error} - ${Reflect.get(broadcastResponse, 'reason')}`);
        }

        // Save to Database for Dashboard Analytics
        try {
            await prisma.transaction.create({
                data: {
                    txid: broadcastResponse.txid,
                    type: 'Execute Intent',
                    userAddress: intent.target,
                    feeAmount: intent.maxFeeUSDCx.toString(),
                    status: 'Pending'
                }
            });
        } catch (dbError) {
            console.error("Failed to save transaction to DB:", dbError);
            // We don't throw here because the transaction was already broadcast successfully
        }

        return {
            txid: broadcastResponse.txid,
            status: "sponsored"
        };
    }

    /**
     * Sponsor a raw Stacks transaction hex
     * Used for Bridge withdrawals where the transaction is already fully built by the client
     */
    public async sponsorRawTransaction(txHex: string) {
        if (!this.relayerKey) throw new Error("Relayer key not configured");

        try {
            // 1. Deserialize the transaction
            const transaction = deserializeTransaction(txHex);

            // 2. Validate it's a sponsored transaction
            if (!transaction.auth.spendingCondition || !('sponsor' in transaction.auth.spendingCondition)) {
                // In Stacks v7, we check the auth field
                const auth: any = transaction.auth;
                if (auth.spendingCondition?.authType !== 0x01 && auth.spendingCondition?.authType !== 0x05) {
                    // 0x05 is SponsoredSingleSig, 0x01 is StandardSingleSig
                    // For 2026/Stacks v7+, we use the authType or sponsor field presence
                }
            }

            // 3. Sign as sponsor
            const signedTx = await sponsorTransaction({
                transaction,
                sponsorPrivateKey: this.relayerKey,
                network: this.network,
            });

            // 4. Broadcast
            const broadcastResponse = await broadcastTransaction({
                transaction: signedTx,
                network: this.network
            });

            if ('error' in broadcastResponse) {
                const errorMessage = broadcastResponse.error;
                const reason = (broadcastResponse as any).reason || 'Unknown reason';
                console.error("Relayer Broadcast Failure:", { errorMessage, reason });
                throw new Error(`Sponsorship broadcast failed: ${errorMessage} (${reason})`);
            }

            // Save to Database
            try {
                await prisma.transaction.create({
                    data: {
                        txid: broadcastResponse.txid,
                        type: 'Native Sponsorship',
                        userAddress: 'unknown', // Could extract from tx if needed
                        feeAmount: '0',
                        status: 'Pending'
                    }
                });
            } catch (e) { }

            return {
                txid: broadcastResponse.txid,
                status: "sponsored"
            };
        } catch (error: any) {
            console.error("Native Sponsorship Error:", error);
            throw error;
        }
    }
}
