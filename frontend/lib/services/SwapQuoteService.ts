/**
 * Swap Quote Service (Client-Side)
 * Fetches quotes directly from the blockchain
 */

import { fetchCallReadOnlyFunction, Cl } from '@stacks/transactions';
import { STACKS_TESTNET } from '@stacks/network';

export interface SwapQuote {
    inputAmount: string;
    outputAmount: string;
    priceImpact: number;
    estimatedFee: string;
    path: string[];
}

/**
 * Get swap quote directly from the contract (client-side)
 */
export async function getSwapQuote(
    inputToken: string,
    outputToken: string,
    inputAmount: string,
    swapContractAddress: string
): Promise<SwapQuote> {
    const [contractAddress, contractName] = swapContractAddress.split('.');
    
    const principalToCV = (principal: string) => {
        if (principal === 'STX') {
            return Cl.principal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM');
        }
        const parts = principal.split('.');
        return Cl.contractPrincipal(parts[0], parts[1]);
    };

    try {
        const response: any = await fetchCallReadOnlyFunction({
            contractAddress,
            contractName,
            functionName: 'quote-swap',
            functionArgs: [
                principalToCV(inputToken),
                principalToCV(outputToken),
                Cl.uint(inputAmount),
            ],
            network: STACKS_TESTNET,
            senderAddress: contractAddress,
        });

        console.log('Quote response:', response);

        if (response.type === 'response-ok') {
            const val = response.value.data;
            return {
                inputAmount,
                outputAmount: val['amount-out'].value.toString(),
                priceImpact: 0.3,
                estimatedFee: val.fee.value.toString(),
                path: [inputToken, outputToken]
            };
        }

        console.error('Quote failed with response:', response);
        throw new Error('No liquidity pool found');
    } catch (error: any) {
        console.error('Failed to fetch swap quote:', error);
        console.error('Contract:', swapContractAddress);
        console.error('Input token:', inputToken);
        console.error('Output token:', outputToken);
        console.error('Amount:', inputAmount);
        throw new Error(error.message || 'No liquidity pool found');
    }
}
