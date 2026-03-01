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
    listCV
} from '@stacks/transactions';
import { StacksNetwork, STACKS_MAINNET, STACKS_TESTNET } from '@stacks/network';
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
        this.relayerKey = process.env.RELAYER_PRIVATE_KEY || '';
        this.smartWalletContract = process.env.SMART_WALLET_CONTRACT || '';

        if (!this.relayerKey) {
            console.warn("WARNING: RELAYER_PRIVATE_KEY not set. Sponsorship will fail.");
        }
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
}
