/**
 * Swap Service
 * Handles price quotes and routing for the VelumX DEX
 */

import { getBackendConfig } from '@/lib/backend/config';
import { logger } from '@/lib/backend/logger';
import { getStacksNetwork } from '@/lib/backend/stacks';
import {
    Cl,
    fetchCallReadOnlyFunction
} from '@stacks/transactions';

export interface SwapQuote {
    inputAmount: string;
    outputAmount: string;
    priceImpact: number;
    estimatedFee: string;
    path: string[];
}

export class SwapService {
    private get config() {
        return getBackendConfig();
    }

    /**
     * Gets a quote for swapping tokenIn for tokenOut
     */
    async getQuote(
        tokenIn: string,
        tokenOut: string,
        amountIn: string
    ): Promise<SwapQuote> {
        logger.info('Fetching quote', { tokenIn, tokenOut, amountIn });

        try {
            // 1. Try direct pool first
            const directQuote = await this.getDirectQuote(tokenIn, tokenOut, amountIn);
            if (directQuote) return directQuote;

            // 2. If direct fails, try routing through USDCx (The "Pivot")
            const usdcxAddress = this.config.stacksUsdcxAddress;

            if (tokenIn !== usdcxAddress && tokenOut !== usdcxAddress) {
                logger.info('Trying route through USDCx', { tokenIn, tokenOut });

                const quoteToUsdcx = await this.getDirectQuote(tokenIn, usdcxAddress, amountIn);
                if (quoteToUsdcx) {
                    const quoteFromUsdcx = await this.getDirectQuote(usdcxAddress, tokenOut, quoteToUsdcx.outputAmount);
                    if (quoteFromUsdcx) {
                        return {
                            inputAmount: amountIn,
                            outputAmount: quoteFromUsdcx.outputAmount,
                            priceImpact: quoteToUsdcx.priceImpact + quoteFromUsdcx.priceImpact,
                            estimatedFee: (BigInt(quoteToUsdcx.estimatedFee) + BigInt(quoteFromUsdcx.estimatedFee)).toString(),
                            path: [tokenIn, usdcxAddress, tokenOut]
                        };
                    }
                }
            }

            throw new Error(`No liquidity pool found for ${tokenIn} -> ${tokenOut}`);
        } catch (error) {
            logger.error('Failed to get swap quote', { error: (error as Error).message });
            throw error;
        }
    }

    private async getDirectQuote(
        tokenIn: string,
        tokenOut: string,
        amountIn: string
    ): Promise<SwapQuote | null> {
        const isInputStx = tokenIn === 'STX';
        const isOutputStx = tokenOut === 'STX';

        // In our contract, STX is represented by a specific principal or handled by specific functions
        // For read-only quote-swap, it expects principals
        const [contractAddress, contractName] = this.config.stacksSwapContractAddress.split('.');

        try {
            const response: any = await fetchCallReadOnlyFunction({
                contractAddress,
                contractName,
                functionName: 'quote-swap',
                functionArgs: [
                    this.principalToCV(tokenIn),
                    this.principalToCV(tokenOut),
                    Cl.uint(amountIn),
                ],
                network: getStacksNetwork(),
                senderAddress: this.config.relayerStacksAddress,
            });

            if (response.type === 'response-ok') {
                const val = response.value.data;
                return {
                    inputAmount: amountIn,
                    outputAmount: val['amount-out'].value.toString(),
                    priceImpact: 0.3, // Hardcoded for now, should calculate properly
                    estimatedFee: val.fee.value.toString(),
                    path: [tokenIn, tokenOut]
                };
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    private principalToCV(principal: string) {
        if (principal === 'STX') {
            // Use the sentinel defined in the contract for STX
            // Based on swap-contract.clar line 10
            return Cl.principal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM');
        }
        const parts = principal.split('.');
        return Cl.contractPrincipal(parts[0], parts[1]);
    }
}

export const swapService = new SwapService();
