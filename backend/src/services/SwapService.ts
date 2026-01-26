/**
 * Swap Service
 * Handles token swaps on Stacks via our deployed swap contract
 */

import { getConfig } from '../config';
import { logger } from '../utils/logger';
import { fetchCallReadOnlyFunction, cvToJSON, principalCV, uintCV } from '@stacks/transactions';
import { createNetwork } from '@stacks/network';
import { withCache } from '../cache/redis';
import { fetchWithRetry } from '../utils/fetch';

export interface TokenInfo {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoUrl?: string;
}

export interface SwapQuote {
  inputToken: string;
  outputToken: string;
  inputAmount: bigint;
  outputAmount: bigint;
  priceImpact: number;
  route: string[];
  estimatedFee: bigint;
  validUntil: number;
}

export interface SwapRoute {
  path: string[];
  pools: string[];
  estimatedOutput: bigint;
}

export class SwapService {
  private config = getConfig();
  private cachedTokens: TokenInfo[] | null = null;
  private tokensCacheExpiry = 0;
  private readonly CACHE_DURATION = 300000; // 5 minutes

  constructor() {
    // Initialize with testnet
  }

  /**
   * Get list of supported tokens for swapping
   */
  async getSupportedTokens(): Promise<TokenInfo[]> {
    // Return cached tokens if still valid
    if (this.cachedTokens && Date.now() < this.tokensCacheExpiry) {
      return this.cachedTokens;
    }

    const { DEFAULT_TOKENS } = await import('../config/liquidity');

    logger.info('Fetching supported tokens from configuration');

    const tokens: TokenInfo[] = DEFAULT_TOKENS.map(t => ({
      symbol: t.symbol,
      name: t.name,
      address: t.address,
      decimals: t.decimals,
    }));

    this.cachedTokens = tokens;
    this.tokensCacheExpiry = Date.now() + this.CACHE_DURATION;

    logger.info(`Loaded ${tokens.length} supported tokens from config`);
    return tokens;
  }

  /**
   * Get swap quote for token pair
   */
  async getSwapQuote(
    inputToken: string,
    outputToken: string,
    inputAmount: bigint
  ): Promise<SwapQuote> {
    const cacheKey = `swap:quote:${inputToken}:${outputToken}:${inputAmount.toString()}`;

    return withCache(cacheKey, async () => {
      logger.info('Getting swap quote from contract', {
        inputToken,
        outputToken,
        inputAmount: inputAmount.toString(),
      });

      try {
        // Validate configuration
        if (!this.config.stacksRpcUrl) {
          throw new Error('STACKS_RPC_URL is not defined');
        }

        // Parse contract address
        const parts = this.config.stacksSwapContractAddress.split('.');
        if (parts.length < 2) {
          throw new Error(`Invalid swap contract address: ${this.config.stacksSwapContractAddress}`);
        }
        const contractAddress = parts[0];
        const contractName = parts[1];

        // Resolve token addresses if symbols are provided
        const supportedTokens = await this.getSupportedTokens();
        const resolveAddress = (input: string) => {
          const token = supportedTokens.find(t => t.symbol === input || t.address === input);
          return token ? token.address : input;
        };

        const tokenInResolved = resolveAddress(inputToken);
        const tokenOutResolved = resolveAddress(outputToken);

        // STX is represented by the sentinel principal in our contract
        const STX_SENTINEL = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';

        const tokenInPrincipal = tokenInResolved === 'STX' || tokenInResolved === STX_SENTINEL ? STX_SENTINEL : tokenInResolved;
        const tokenOutPrincipal = tokenOutResolved === 'STX' || tokenOutResolved === STX_SENTINEL ? STX_SENTINEL : tokenOutResolved;

        // Configure network
        const network = createNetwork({
          network: 'testnet',
          client: { baseUrl: this.config.stacksRpcUrl },
        });

        logger.debug('Calling quote-swap with resolved principals', {
          tokenIn: tokenInPrincipal,
          tokenOut: tokenOutPrincipal,
          inputAmount: inputAmount.toString()
        });

        // Call quote-swap read-only function
        let result;
        try {
          result = await fetchCallReadOnlyFunction({
            contractAddress,
            contractName,
            functionName: 'quote-swap',
            functionArgs: [
              principalCV(tokenInPrincipal),
              principalCV(tokenOutPrincipal),
              uintCV(inputAmount),
            ],
            network,
            senderAddress: contractAddress,
          });
        } catch (callError) {
          logger.error('Stacks read-only call failed (quote-swap)', {
            error: callError instanceof Error ? callError.message : String(callError),
            tokenIn: tokenInPrincipal,
            tokenOut: tokenOutPrincipal,
            rpcUrl: this.config.stacksRpcUrl
          });
          throw new Error(`RPC communication error: ${callError instanceof Error ? callError.message : 'Node unreachable'}`);
        }

        // Parse result
        const resultJson = cvToJSON(result);

        if (resultJson.success === false || !resultJson.value) {
          logger.warn('Contract returned error for quote', { resultJson });
          throw new Error('Pool not found or swap parameters invalid');
        }

        // The contract returns (ok {amount-out: uint, fee: uint})
        const quoteData = resultJson.value.value;
        if (!quoteData || !quoteData['amount-out'] || !quoteData.fee) {
          throw new Error('Unexpected quote format from contract');
        }

        const outputAmount = BigInt(quoteData['amount-out'].value);
        const fee = BigInt(quoteData.fee.value);

        // Calculate price impact
        let priceImpact = 0;
        try {
          const { reserveA } = await this.getReserves(tokenInPrincipal, tokenOutPrincipal);
          if (reserveA > 0n) {
            priceImpact = (Number(inputAmount) / (Number(reserveA) + Number(inputAmount))) * 100;
          }
        } catch (e) {
          logger.debug('Could not calculate price impact for quote');
        }

        const quote: SwapQuote = {
          inputToken,
          outputToken,
          inputAmount,
          outputAmount,
          priceImpact,
          route: [inputToken, outputToken],
          estimatedFee: fee,
          validUntil: Date.now() + 60000,
        };

        return quote;
      } catch (error) {
        logger.error('SwapService.getSwapQuote failed', {
          error: error instanceof Error ? error.message : String(error),
          inputToken,
          outputToken
        });
        throw error;
      }
    }, 30); // 30 second cache
  }

  /**
   * Helper to get reserves for a token pair
   * Handles sorting internally matching the contract
   */
  private async getReserves(tokenA: string, tokenB: string): Promise<{ reserveA: bigint, reserveB: bigint }> {
    const { liquidityService } = await import('./LiquidityService');
    const reserves = await liquidityService.getPoolReserves(tokenA, tokenB);

    return {
      reserveA: reserves.reserveA,
      reserveB: reserves.reserveB
    };
  }
  /**
   * Validate swap parameters
   */
  async validateSwap(
    userAddress: string,
    inputToken: string,
    inputAmount: bigint
  ): Promise<{ valid: boolean; error?: string }> {
    // Check user has sufficient balance
    try {
      const response = await fetchWithRetry(
        `${this.config.stacksRpcUrl}/extended/v1/address/${userAddress}/balances`
      );

      const data: any = await response.json();

      // Check USDCx balance
      if (inputToken.includes('usdcx')) {
        const fungibleTokens = data.fungible_tokens || {};
        const usdcxKey = Object.keys(fungibleTokens).find(key => key.startsWith(this.config.stacksUsdcxAddress));
        const usdcxBalance = usdcxKey ? BigInt(fungibleTokens[usdcxKey].balance) : BigInt(0);

        if (usdcxBalance < inputAmount) {
          return { valid: false, error: 'Insufficient USDCx balance' };
        }
      }

      // Check STX balance for non-gasless swaps
      const stxBalance = BigInt(data.stx.balance);
      if (stxBalance < BigInt(100000)) {
        logger.warn('User has low STX balance, recommend gasless mode', {
          userAddress,
          stxBalance: stxBalance.toString(),
        });
      }

      return { valid: true };
    } catch (error) {
      logger.error('Failed to validate swap', { error, userAddress });
      return { valid: false, error: 'Validation failed' };
    }
  }

  /**
   * Clear token cache
   */
  clearCache(): void {
    this.cachedTokens = null;
    this.tokensCacheExpiry = 0;
    logger.debug('Token cache cleared');
  }
}

// Export singleton instance
export const swapService = new SwapService();
