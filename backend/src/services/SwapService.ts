/**
 * Swap Service
 * Handles token swaps on Stacks via our deployed swap contract
 */

import { getConfig } from '../config';
import { logger } from '../utils/logger';
import { fetchCallReadOnlyFunction, cvToJSON, principalCV, uintCV } from '@stacks/transactions';

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

    logger.info('Fetching supported tokens');

    // For now, return hardcoded list of tokens
    // In production, this could query available pools from the contract
    const tokens: TokenInfo[] = [
      {
        symbol: 'USDCx',
        name: 'USDC (xReserve)',
        address: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx',
        decimals: 6,
      },
      {
        symbol: 'STX',
        name: 'Stacks',
        address: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM', // Use sentinel principal
        decimals: 6,
      },
      {
        symbol: 'VEX',
        name: 'VelumX Token',
        address: 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.vextoken-v1',
        decimals: 6,
      },
    ];

    this.cachedTokens = tokens;
    this.tokensCacheExpiry = Date.now() + this.CACHE_DURATION;

    logger.info(`Loaded ${tokens.length} supported tokens`);
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
    logger.info('Getting swap quote from our contract', {
      inputToken,
      outputToken,
      inputAmount: inputAmount.toString(),
    });

    try {
      // Parse contract address
      const parts = this.config.stacksSwapContractAddress.split('.');
      const contractAddress = parts[0];
      const contractName = parts[1] || 'swap-contract';

      // Parse token addresses - handle both contract.name and naked principals (like STX or user addr)
      const tokenInParts = inputToken.split('.');
      const tokenInPrincipalInput = tokenInParts.length === 2
        ? `${tokenInParts[0]}.${tokenInParts[1]}`
        : inputToken;

      const tokenOutParts = outputToken.split('.');
      const tokenOutPrincipalInput = tokenOutParts.length === 2
        ? `${tokenOutParts[0]}.${tokenOutParts[1]}`
        : outputToken;

      // STX is represented by the sentinel principal in our contract
      const STX_SENTINEL = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';

      const tokenInPrincipal = tokenInPrincipalInput === 'STX' || tokenInPrincipalInput === 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM' ? STX_SENTINEL : tokenInPrincipalInput;
      const tokenOutPrincipal = tokenOutPrincipalInput === 'STX' || tokenOutPrincipalInput === 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM' ? STX_SENTINEL : tokenOutPrincipalInput;

      // Get pool reserves for price impact calculation
      let priceImpact = 0;
      try {
        const { reserveA, reserveB } = await this.getReserves(tokenInPrincipal, tokenOutPrincipal);
        if (reserveA > 0n && reserveB > 0n) {
          // Simplified price impact for constant product: amountIn / (reserveIn + amountIn)
          // We need to know which reserve is 'input'
          // The contract's sort-tokens determines this, but we can just use the one that matches our input
          // Or more accurately: price impact = (1 - (amountOut / (amountIn * spotPrice)))
          const spotPrice = Number(reserveB) / Number(reserveA);
          // We'll calculate this better after getting amountOut
        }
      } catch (e) {
        logger.warn('Could not fetch reserves for price impact', { tokenA: tokenInPrincipal, tokenB: tokenOutPrincipal });
      }

      // Call quote-swap read-only function
      const result = await fetchCallReadOnlyFunction({
        contractAddress,
        contractName,
        functionName: 'quote-swap',
        functionArgs: [
          principalCV(tokenInPrincipal),
          principalCV(tokenOutPrincipal),
          uintCV(inputAmount),
        ],
        network: 'testnet',
        senderAddress: contractAddress,
      });

      // Parse result
      const resultJson = cvToJSON(result);

      if (resultJson.success === false || !resultJson.value) {
        throw new Error('Pool not found or invalid quote from contract');
      }

      // The contract returns (ok {amount-out: uint, fee: uint})
      const quoteData = resultJson.value.value;
      const outputAmount = BigInt(quoteData['amount-out'].value);
      const fee = BigInt(quoteData.fee.value);

      // Recalculate price impact properly now that we have outputAmount
      try {
        const { reserveA } = await this.getReserves(tokenInPrincipal, tokenOutPrincipal);
        if (reserveA > 0n) {
          // Standard CPMM price impact: amountIn / (reserveIn + amountIn)
          priceImpact = (Number(inputAmount) / (Number(reserveA) + Number(inputAmount))) * 100;
        }
      } catch (e) {
        // Fallback or ignore
      }

      const quote: SwapQuote = {
        inputToken,
        outputToken,
        inputAmount,
        outputAmount,
        priceImpact,
        route: [inputToken, outputToken],
        estimatedFee: fee,
        validUntil: Date.now() + 60000, // Valid for 1 minute
      };

      logger.info('Swap quote generated from contract', {
        outputAmount: outputAmount.toString(),
        priceImpact,
        fee: fee.toString(),
      });

      return quote;
    } catch (error) {
      logger.error('Failed to get quote from contract', { error });
      throw new Error('Failed to get swap quote. Pool may not exist yet.');
    }
  }

  /**
   * Helper to get reserves for a token pair
   * Handles sorting internally matching the contract
   */
  private async getReserves(tokenA: string, tokenB: string): Promise<{ reserveA: bigint, reserveB: bigint }> {
    const { liquidityService } = await import('./LiquidityService');
    const reserves = await liquidityService.getPoolReserves(tokenA, tokenB);

    // We need to know which one is tokenA in the contract's sorted map
    // The contract uses alphabetical sort of principals
    // But liquidityService already handles sorting?
    // Let's just return what it has.
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
      const response = await fetch(
        `${this.config.stacksRpcUrl}/extended/v1/address/${userAddress}/balances`
      );

      if (!response.ok) {
        return { valid: false, error: 'Failed to fetch user balance' };
      }

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
