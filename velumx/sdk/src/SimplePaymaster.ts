/**
 * Simple Paymaster SDK
 * Simplified gasless transactions using Stacks-native sponsored transactions
 */

import { openContractCall } from '@stacks/connect';
import { 
    uintCV, 
    bufferCV, 
    principalCV, 
    contractPrincipalCV,
    ClarityValue,
    PostConditionMode
} from '@stacks/transactions';

export interface SimplePaymasterConfig {
    network: 'mainnet' | 'testnet';
    paymasterContract: string; // e.g., 'DEPLOYER.simple-paymaster-v1'
    relayerAddress: string; // e.g., 'STKY...25E3P'
    usdcxContract: string; // e.g., 'ST1P...PGZGM.usdcx'
}

export interface BridgeParams {
    amount: string; // Amount in micro units (e.g., "10000000" for 10 USDCx)
    recipient: string; // Ethereum address (0x...)
    feeUsdcx: string; // Fee in micro units (e.g., "250000" for 0.25 USDCx)
    onFinish?: (data: any) => void;
    onCancel?: () => void;
}

export interface SwapParams {
    tokenIn: string; // Contract principal
    tokenOut: string; // Contract principal
    amountIn: string; // Amount in micro units
    minOut: string; // Minimum output in micro units
    feeUsdcx: string; // Fee in micro units
    onFinish?: (data: any) => void;
    onCancel?: () => void;
}

export class SimplePaymaster {
    private config: SimplePaymasterConfig;

    constructor(config: SimplePaymasterConfig) {
        this.config = config;
    }

    /**
     * Execute gasless bridge withdrawal (Stacks → Ethereum)
     */
    async bridgeGasless(params: BridgeParams): Promise<void> {
        const [contractAddress, contractName] = this.config.paymasterContract.split('.');
        
        // Encode Ethereum address to bytes32
        const recipientBytes = this.encodeEthereumAddress(params.recipient);

        const functionArgs: ClarityValue[] = [
            uintCV(params.amount),
            bufferCV(recipientBytes),
            uintCV(params.feeUsdcx),
            principalCV(this.config.relayerAddress),
            contractPrincipalCV(this.config.usdcxContract.split('.')[0], this.config.usdcxContract.split('.')[1])
        ];

        await openContractCall({
            contractAddress,
            contractName,
            functionName: 'bridge-gasless',
            functionArgs,
            network: this.config.network,
            sponsored: true,
            postConditionMode: PostConditionMode.Allow,
            onFinish: params.onFinish || (() => {}),
            onCancel: params.onCancel || (() => {}),
        });
    }

    /**
     * Execute gasless swap
     */
    async swapGasless(params: SwapParams): Promise<void> {
        const [contractAddress, contractName] = this.config.paymasterContract.split('.');

        const functionArgs: ClarityValue[] = [
            principalCV(params.tokenIn),
            principalCV(params.tokenOut),
            uintCV(params.amountIn),
            uintCV(params.minOut),
            uintCV(params.feeUsdcx),
            principalCV(this.config.relayerAddress),
            contractPrincipalCV(this.config.usdcxContract.split('.')[0], this.config.usdcxContract.split('.')[1])
        ];

        await openContractCall({
            contractAddress,
            contractName,
            functionName: 'swap-gasless',
            functionArgs,
            network: this.config.network,
            sponsored: true,
            postConditionMode: PostConditionMode.Allow,
            onFinish: params.onFinish || (() => {}),
            onCancel: params.onCancel || (() => {}),
        });
    }

    /**
     * Estimate fee for gasless transaction
     */
    async estimateFee(estimatedGas: number = 100000): Promise<{ feeUsdcx: string }> {
        // Simple fee calculation: ~0.25 USDCx per transaction
        // In production, this would call the relayer API
        return {
            feeUsdcx: '250000' // 0.25 USDCx
        };
    }

    /**
     * Encode Ethereum address to bytes32 for Stacks contract
     */
    private encodeEthereumAddress(address: string): Uint8Array {
        const hex = address.startsWith('0x') ? address.slice(2) : address;
        const paddedHex = hex.padStart(64, '0');
        const bytes = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
            bytes[i] = parseInt(paddedHex.substring(i * 2, i * 2 + 2), 16);
        }
        return bytes;
    }
}
