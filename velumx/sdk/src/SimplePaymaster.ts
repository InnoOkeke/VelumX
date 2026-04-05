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
    PostConditionMode,
    Cl
} from '@stacks/transactions';

export interface SimplePaymasterConfig {
    network: 'mainnet' | 'testnet';
    paymasterContract: string; // e.g., 'DEPLOYER.universal-paymaster-v1'
    relayerAddress: string; // e.g., 'STKY...25E3P'
    relayerUrl?: string; // Optional: URL of your VelumX Relayer
    apiKey?: string;     // Optional: Your VelumX API Key
}

export interface BridgeParams {
    amount: string; // Amount in micro units
    recipient: string; // Ethereum address
    feeAmount: string; // Fee in micro units
    feeToken: string; // Contract principal of gas token
    onFinish?: (data: any) => void;
    onCancel?: () => void;
}

export interface SwapParams {
    tokenIn: string; // Contract principal
    tokenOut: string; // Contract principal
    amountIn: string; // Amount in micro units
    minOut: string; // Minimum output
    feeAmount: string; // Fee in micro units
    feeToken: string; // Contract principal of gas token
    onFinish?: (data: any) => void;
    onCancel?: () => void;
}

export interface TransferParams {
    token: string; // Contract principal of token to transfer
    amount: string; // Amount in micro units
    recipient: string; // Stacks address
    feeAmount: string; // Fee in micro units
    feeToken: string; // Contract principal of gas token
    onFinish?: (data: any) => void;
    onCancel?: () => void;
}

export interface ExecuteParams {
    target: string; // Contract principal implementing executor-trait-v1
    actionId: string; // 32-byte hex string
    param: string; // Numeric parameter
    feeAmount: string; // Fee in micro units
    feeToken: string; // Contract principal of gas token
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
        const paymasterContract = this.config.paymasterContract || 
            (this.config.network === 'mainnet' 
                ? 'SPKYNF473GQ1V0WWCF24TV7ZR1WYAKTC7AM8QGBW.universal-paymaster-v1' 
                : 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.universal-paymaster-v1');


        const [paymasterAddress, paymasterName] = paymasterContract.split('.');
        const [feeContractAddr, feeContractName] = params.feeToken.split('.');
        const [targetAddress, _targetName] = (this.config.network === 'mainnet' 
            ? 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.bridge-contract' 
            : 'ST120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.bridge-contract').split('.');

        const functionArgs: ClarityValue[] = [
            contractPrincipalCV(feeContractAddr, feeContractName),
            uintCV(params.feeAmount),
            principalCV(this.config.relayerAddress),
            principalCV(targetAddress),
            Cl.stringAscii('bridge-tokens'),
            bufferCV(Buffer.from(params.recipient.replace(/^0x/, ''), 'hex'))
        ];

        await openContractCall({
            contractAddress: paymasterAddress,
            contractName: paymasterName,
            functionName: 'call-gasless',
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
        const paymasterContract = this.config.paymasterContract || 
            (this.config.network === 'mainnet' 
                ? 'SPKYNF473GQ1V0WWCF24TV7ZR1WYAKTC7AM8QGBW.universal-paymaster-v1' 
                : 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.universal-paymaster-v1');

        const [pAddress, pName] = paymasterContract.split('.');
        const [fAddress, fName] = params.feeToken.split('.');
        const [tokenInAddress] = params.tokenIn.split('.');

        await openContractCall({
            contractAddress: pAddress,
            contractName: pName,
            functionName: 'call-gasless',
            functionArgs: [
                contractPrincipalCV(fAddress, fName),
                uintCV(params.feeAmount),
                principalCV(this.config.relayerAddress),
                principalCV(tokenInAddress),
                Cl.stringAscii('swap-v1'),
                bufferCV(Buffer.from(params.amountIn))
            ],
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
        const paymasterContract = this.config.paymasterContract || 
            (this.config.network === 'mainnet' 
                ? 'SPKYNF473GQ1V0WWCF24TV7ZR1WYAKTC7AM8QGBW.universal-paymaster-v1' 
                : 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.universal-paymaster-v1');

        const [pAddress, pName] = paymasterContract.split('.');
        const [fAddress, fName] = params.feeToken.split('.');
        const [tokenAddress] = params.token.split('.');

        await openContractCall({
            contractAddress: pAddress,
            contractName: pName,
            functionName: 'call-gasless',
            functionArgs: [
                contractPrincipalCV(fAddress, fName),
                uintCV(params.feeAmount),
                principalCV(this.config.relayerAddress),
                principalCV(tokenAddress),
                Cl.stringAscii('transfer'),
                bufferCV(Buffer.from(params.amount))
            ],
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
        const paymasterContract = this.config.paymasterContract || 
            (this.config.network === 'mainnet' 
                ? 'SPKYNF473GQ1V0WWCF24TV7ZR1WYAKTC7AM8QGBW.universal-paymaster-v1' 
                : 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.universal-paymaster-v1');

        const [pAddress, pName] = paymasterContract.split('.');
        const [fAddress, fName] = params.feeToken.split('.');
        const [targetAddress] = params.target.split('.');

        await openContractCall({
            contractAddress: pAddress,
            contractName: pName,
            functionName: 'call-gasless',
            functionArgs: [
                contractPrincipalCV(fAddress, fName),
                uintCV(params.feeAmount),
                principalCV(this.config.relayerAddress),
                principalCV(targetAddress),
                Cl.stringAscii('universal-execute'),
                bufferCV(Buffer.from(params.actionId.replace(/^0x/, ''), 'hex'))
            ],
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
        txType?: string,
        feeToken: string 
    }): Promise<{ feeAmount: string; feeToken: string; policy: string; isSponsored: boolean }> {
        const { estimatedGas = 150000, userAddress = 'unknown', txType = 'generic', feeToken } = params;
        
        // Use provided relayerUrl or fallback to the VelumX production URL
        const relayerUrl = this.config.relayerUrl || 'https://relayer.velumx.com';

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
                        txType,
                        feeToken
                    },
                    userAddress
                })
            });

            if (res.ok) {
                const data = await res.json();
                return {
                    feeAmount: data.maxFee,
                    feeToken: data.feeToken || feeToken,
                    policy: data.policy || 'UNKNOWN',
                    isSponsored: data.maxFee === "0"
                };
            } else {
                throw new Error(`Relayer error: ${res.statusText}`);
            }
        } catch (e) {
            console.warn("Relayer: Error estimating fee. Falling back to default.", e);
            return {
                feeAmount: "250000",
                feeToken: feeToken,
                policy: "DEFAULT_FALLBACK",
                isSponsored: false
            };
        }
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
