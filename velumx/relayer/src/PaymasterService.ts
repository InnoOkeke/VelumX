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
import crypto from 'node:crypto';

const prisma = new PrismaClient();

// Simple interface matching the SDK
interface SignedIntent {
    target: string;
    payload: string; // Packed transaction buffer
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

    public async estimateFee(intent: any) {
        // Logic to calculate estimated STX gas, convert using Oracle rate, and add markup
        return {
            maxFeeUSDCx: "250000", // e.g. $0.25
            estimatedGas: 5000
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

        let [contractAddress, contractName] = this.smartWalletContract.split('.');

        // If relative (e.g. .smart-wallet-v10), derive address from active key
        if (!contractAddress && activeKey) {
            const { getAddressFromPrivateKey } = await import('@stacks/transactions');
            const version = process.env.NETWORK === 'mainnet' ? 0 : 1;
            contractAddress = getAddressFromPrivateKey(activeKey, version as any);
        }

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
                principalCV(process.env.USDCX_TOKEN || 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx')
            ],
            senderKey: activeKey,
            validateWithAbi: false,
            network: this.network,
            anchorMode: AnchorMode.Any,
            postConditionMode: PostConditionMode.Allow,
        };

        try {
            const transaction = await makeContractCall(txOptions);
            const response = await broadcastTransaction({ transaction, network: this.network });

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
    public async sponsorRawTransaction(txHex: string, userId?: string) {
        const activeKey = userId ? this.getUserRelayerKey(userId) : this.relayerKey;
        if (!activeKey) throw new Error("Relayer key not configured");

        try {
            const transaction = deserializeTransaction(txHex);

            // Sign as sponsor
            const RELAYER_FEE = 50000n; // microSTX

            const signedTx = await sponsorTransaction({
                transaction,
                sponsorPrivateKey: activeKey,
                network: this.network,
                fee: RELAYER_FEE,
            });

            // Broadcast
            const response = await broadcastTransaction({ transaction: signedTx, network: this.network });

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
                        userAddress: 'unknown',
                        feeAmount: '0',
                        status: 'Pending',
                        userId: userId || null
                    }
                });
            } catch (e) { }

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
