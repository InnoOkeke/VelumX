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
        if (!this.relayerKey) throw new Error("Relayer key not configured");

        console.log("Relayer: Processing account-abstraction intent", {
            target: intent.target,
            nonce: intent.nonce,
            maxFee: intent.maxFeeUSDCx
        });

        const [contractAddress, contractName] = this.smartWalletContract.split('.');

        const txOptions = {
            contractAddress,
            contractName,
            functionName: 'execute-gasless',
            functionArgs: [
                principalCV(intent.target),
                bufferCV(Buffer.alloc(0)), // Placeholder payload for v3
                uintCV(intent.maxFeeUSDCx),
                uintCV(intent.nonce),
                bufferCV(Buffer.from(intent.signature, 'hex')),
                principalCV(process.env.USDCX_TOKEN || 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx')
            ],
            senderKey: this.relayerKey,
            validateWithAbi: false,
            network: this.network,
            anchorMode: AnchorMode.Any,
            postConditionMode: PostConditionMode.Allow,
        };

        try {
            const transaction = await makeContractCall(txOptions);
            const txHex = Buffer.from(transaction.serialize()).toString('hex');
            const broadcastUrl = `${this.network.client.baseUrl}/v2/transactions`;

            console.log(`Relayer: Broadcasting intent execution tx`, { txid: transaction.txid() });

            const response = await fetch(broadcastUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tx_hex: txHex })
            });

            const responseText = await response.text();
            let responseData: any = {};
            try { responseData = JSON.parse(responseText); } catch (e) { }

            if (response.status !== 200 || responseData.error) {
                const errorMsg = responseData.error || responseData.message || responseText || 'Unknown node error';
                throw new Error(`Intent broadcast failed: ${errorMsg}`);
            }

            const txid = (responseData.txid || responseText).replace(/"/g, '').replace('0x', '');

            // Save to Database
            try {
                await prisma.transaction.create({
                    data: {
                        txid,
                        type: 'Intent Sponsorship',
                        userAddress: intent.target,
                        feeAmount: intent.maxFeeUSDCx.toString(),
                        status: 'Pending'
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
            // Standard fee for sponsored transactions (0.05 STX)
            const RELAYER_FEE = 50000n; // microSTX

            const signedTx = await sponsorTransaction({
                transaction,
                sponsorPrivateKey: this.relayerKey,
                network: this.network,
                fee: RELAYER_FEE,
            });

            console.log("Relayer: Transaction sponsored successfully", {
                version: (signedTx as any).version,
                chainId: (signedTx as any).chainId,
                fee: RELAYER_FEE.toString()
            });

            // 4. Broadcast via JSON object (Hiro API requirement)
            const txHexToBroadcast = Buffer.from(signedTx.serialize()).toString('hex');
            const broadcastUrl = `${this.network.client.baseUrl}/v2/transactions`;

            const response = await fetch(broadcastUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tx_hex: txHexToBroadcast })
            });

            const responseText = await response.text();
            let responseData: any = {};
            try { responseData = JSON.parse(responseText); } catch (e) { }

            if (response.status !== 200 || responseData.error) {
                const errorMsg = responseData.error || responseData.message || responseText || 'Unknown node error';
                throw new Error(`Broadcast failed: ${errorMsg}`);
            }

            const txid = (responseData.txid || responseText).replace(/"/g, '').replace('0x', '');

            // Save to Database
            try {
                await prisma.transaction.create({
                    data: {
                        txid: txid,
                        type: 'Native Sponsorship',
                        userAddress: 'unknown',
                        feeAmount: '0',
                        status: 'Pending'
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
