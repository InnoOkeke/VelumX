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
    relayerUrl?: string; // Optional: URL of your VelumX Relayer
    apiKey?: string;     // Optional: Your VelumX API Key
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

export interface TransferParams {
    token: string; // Contract principal of token to transfer (e.g. 'SP...usdcx')
    amount: string; // Amount in micro units
    recipient: string; // Stacks address
    feeUsdcx: string; // Fee in micro units
    onFinish?: (data: any) => void;
    onCancel?: () => void;
}

export interface ExecuteParams {
    target: string; // Contract principal implementing executor-trait-v1
    actionId: string; // 32-byte hex string (e.g., hash of action)
    param: string; // Numeric parameter for the action
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
     * Execute gasless token transfer
     */
    async transferGasless(params: TransferParams): Promise<void> {
        const [contractAddress, contractName] = this.config.paymasterContract.split('.');
        const [tokenAddress, tokenName] = params.token.split('.');

        const functionArgs: ClarityValue[] = [
            contractPrincipalCV(tokenAddress, tokenName),
            uintCV(params.amount),
            principalCV(params.recipient),
            uintCV(params.feeUsdcx),
            principalCV(this.config.relayerAddress),
            contractPrincipalCV(this.config.usdcxContract.split('.')[0], this.config.usdcxContract.split('.')[1])
        ];

        await openContractCall({
            contractAddress,
            contractName,
            functionName: 'transfer-gasless',
            functionArgs,
            network: this.config.network,
            sponsored: true,
            postConditionMode: PostConditionMode.Allow,
            onFinish: params.onFinish || (() => {}),
            onCancel: params.onCancel || (() => {}),
        });
    }

    /**
     * Execute universal gasless action
     */
    async executeGasless(params: ExecuteParams): Promise<void> {
        const [contractAddress, contractName] = this.config.paymasterContract.split('.');
        const [targetAddress, targetName] = params.target.split('.');

        const functionArgs: ClarityValue[] = [
            contractPrincipalCV(targetAddress, targetName),
            bufferCV(Buffer.from(params.actionId.replace(/^0x/, ''), 'hex')),
            uintCV(params.param),
            uintCV(params.feeUsdcx),
            principalCV(this.config.relayerAddress),
            contractPrincipalCV(this.config.usdcxContract.split('.')[0], this.config.usdcxContract.split('.')[1])
        ];

        await openContractCall({
            contractAddress,
            contractName,
            functionName: 'execute-gasless',
            functionArgs,
            network: this.config.network,
            sponsored: true,
            postConditionMode: PostConditionMode.Allow,
            onFinish: params.onFinish || (() => {}),
            onCancel: params.onCancel || (() => {}),
        });
    }

    /**
     * Estimate fee for gasless transaction by calling the Relayer API
     */
    async estimateFee(params: { 
        estimatedGas?: number, 
        userAddress?: string,
        txType?: string 
    } = {}): Promise<{ feeUsdcx: string; policy: string; isSponsored: boolean }> {
        const { estimatedGas = 100000, userAddress = 'unknown', txType = 'generic' } = params;
        
        // Use provided relayerUrl or fallback to a default (if applicable)
        const relayerUrl = this.config.relayerUrl || 'https://sgal-relayer.onrender.com';

        try {
            const res = await fetch(`${relayerUrl}/api/v1/estimate`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-api-key': this.config.apiKey || ''
                },
                body: JSON.stringify({
                    intent: { 
                        estimatedGas, 
                        network: this.config.network,
                        txType
                    },
                    userAddress
                })
            });

            if (res.ok) {
                const data = await res.json();
                return {
                    feeUsdcx: data.maxFeeUSDCx,
                    policy: data.policy || 'UNKNOWN',
                    isSponsored: data.maxFeeUSDCx === "0"
                };
            }
        } catch (e) {
            console.error("VelumX SDK: Fee estimation failed, using fallback.", e);
        }

        // Final fallback: 0.25 USDCx if Relayer is unreachable
        return { 
            feeUsdcx: '250000', 
            policy: 'USER_PAYS', 
            isSponsored: false 
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
