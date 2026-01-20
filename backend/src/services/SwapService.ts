/**
 * Swap Service
 * Handles token swaps on Stacks via Velar DEX with gasless support
 */

import { VelarSDK } from '@velarprotocol/velar-sdk';
import { getConfig } from '../config';
import { logger } from '../utils/logger';

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
  private sdk: VelarSDK;
  private cachedTokens: TokenInfo[] | null = null;
  private tokensCacheExpiry = 0;
  private readonly CACHE_DURATION = 300000; // 5 minutes

  constructor() {
    this.sdk = new VelarSDK();
  }

  /**
   * Get list of supported tokens for swapping
   */
  async getSupportedTokens(): Promise<TokenInfo[]> {
    // Return cached tokens if still valid
    if (this.cachedTokens && Date.now() < this.tokensCacheExpiry) {
      return this.cachedTokens;
    }

    logger.info('Fetching supported tokens from Velar');

    try {
      // Fetch token list from Velar SDK
      const response = await fetch('https://sdk-beta.velar.network/tokens/symbols');
      const tokenSymbols = await response.json() as string[];

      // Map common tokens with metadata
      const tokenMetadata: Record<string, Partial<TokenInfo>> = {
        'STX': { name: 'Stacks', decimals: 6 },
        'VELAR': { name: 'Velar Token', decimals: 6 },
        'aeUSDC': { name: 'Wrapped USDC', decimals: 6 },
        'aBTC': { name: 'Wrapped Bitcoin', decimals: 8 },
        'WELSH': { name: 'Welsh Token', decimals: 6 },
        'SOME': { name: 'Some Token', decimals: 6 },
        'USDCx': { name: 'USDC (xReserve)', decimals: 6, address: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx' },
      };

      const tokens: TokenInfo[] = tokenSymbols
        .filter(symbol => tokenMetadata[symbol] || symbol === 'USDCx')
        .map(symbol => ({
          symbol,
          name: tokenMetadata[symbol]?.name || symbol,
          address: tokenMetadata[symbol]?.address || `SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.${symbol.toLowerCase()}`,
          decimals: tokenMetadata[symbol]?.decimals || 6,
        }));

      // Always include USDCx if not in list
      if (!tokens.find(t => t.symbol === 'USDCx')) {
        tokens.unshift({
          symbol: 'USDCx',
          name: 'USDC (xReserve)',
          address: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx',
          decimals: 6,
        });
      }

      this.cachedTokens = tokens;
      this.tokensCacheExpiry = Date.now() + this.CACHE_DURATION;

      logger.info(`Fetched ${tokens.length} supported tokens`);
      return tokens;
    } catch (error) {
      logger.error('Failed to fetch tokens from Velar, using fallback list', { error });

      // Fallback to basic token list
      const fallbackTokens: TokenInfo[] = [
        {
          symbol: 'USDCx',
          name: 'USDC (xReserve)',
          address: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx',
          decimals: 6,
        },
        {
          symbol: 'STX',
          name: 'Stacks',
          address: 'STX',
          decimals: 6,
        },
        {
          symbol: 'VELAR',
          name: 'Velar Token',
          address: 'SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.velar-token',
          decimals: 6,
        },
      ];

      this.cachedTokens = fallbackTokens;
      this.tokensCacheExpiry = Date.now() + this.CACHE_DURATION;

      return fallbackTokens;
    }
  }

  /**
   * Get swap quote for token pair
   */
  async getSwapQuote(
    inputToken: string,
    outputToken: string,
    inputAmount: bigint
  ): Promise<SwapQuote> {
    logger.info('Getting swap quote from Velar', {
      inputToken,
      outputToken,
      inputAmount: inputAmount.toString(),
    });

    try {
      // Get token symbols from addresses
      const inputSymbol = this.getTokenSymbol(inputToken);
      const outputSymbol = this.getTokenSymbol(outputToken);

      // Create swap instance
      const swapInstance = await this.sdk.getSwapInstance({
        account: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM', // Placeholder for quote
        inToken: inputSymbol,
        outToken: outputSymbol,
      });

      // Get computed amount with 0.5% slippage
      const amountOut = await swapInstance.getComputedAmount({
        amount: Number(inputAmount) / Math.pow(10, 6), // Convert from micro units
        slippage: 0.5,
      });

      // Extract route information - Velar SDK returns route details
      const route = (amountOut as any).path || [inputSymbol, outputSymbol];
      const outputAmount = BigInt(Math.floor((amountOut as any).amount * Math.pow(10, 6)));
      const priceImpact = (amountOut as any).priceImpact || 0.5;
      const estimatedFee = BigInt(100000); // 0.1 USDCx for gasless mode

      const quote: SwapQuote = {
        inputToken,
        outputToken,
        inputAmount,
        outputAmount,
        priceImpact,
        route,
        estimatedFee,
        validUntil: Date.now() + 60000, // Valid for 1 minute
      };

      logger.info('Swap quote generated from Velar', {
        outputAmount: outputAmount.toString(),
        priceImpact,
        route,
      });

      return quote;
    } catch (error) {
      logger.error('Failed to get quote from Velar, using fallback', { error });

      // Fallback to estimated quote
      const route = await this.findBestRoute(inputToken, outputToken);
      const outputAmount = await this.estimateOutput(inputToken, outputToken, inputAmount, route);
      const priceImpact = this.calculatePriceImpact(inputAmount, outputAmount);
      const estimatedFee = BigInt(100000);

      return {
        inputToken,
        outputToken,
        inputAmount,
        outputAmount,
        priceImpact,
        route: route.path,
        estimatedFee,
        validUntil: Date.now() + 60000,
      };
    }
  }

  /**
   * Find best route for swap
   */
  private async findBestRoute(
    inputToken: string,
    outputToken: string
  ): Promise<SwapRoute> {
    // Direct swap if pool exists
    if (this.hasDirectPool(inputToken, outputToken)) {
      return {
        path: [inputToken, outputToken],
        pools: [`${inputToken}-${outputToken}`],
        estimatedOutput: BigInt(0), // Will be calculated
      };
    }

    // Route through STX if no direct pool
    return {
      path: [inputToken, 'STX', outputToken],
      pools: [`${inputToken}-STX`, `STX-${outputToken}`],
      estimatedOutput: BigInt(0),
    };
  }

  /**
   * Check if direct pool exists
   */
  private hasDirectPool(tokenA: string, tokenB: string): boolean {
    // Common pairs on Velar DEX
    const commonPairs = [
      'USDCx-STX',
      'STX-VELAR',
      'STX-aeUSDC',
      'STX-aBTC',
      'VELAR-aeUSDC',
    ];

    const pairKey = `${this.getTokenSymbol(tokenA)}-${this.getTokenSymbol(tokenB)}`;
    const reversePairKey = `${this.getTokenSymbol(tokenB)}-${this.getTokenSymbol(tokenA)}`;

    return commonPairs.includes(pairKey) || commonPairs.includes(reversePairKey);
  }

  /**
   * Estimate output amount for swap
   */
  private async estimateOutput(
    inputToken: string,
    outputToken: string,
    inputAmount: bigint,
    route: SwapRoute
  ): Promise<bigint> {
    // Fallback pricing when Velar SDK fails
    const inputSymbol = this.getTokenSymbol(inputToken);
    const outputSymbol = this.getTokenSymbol(outputToken);

    // Approximate exchange rates
    const rates: Record<string, Record<string, number>> = {
      'USDCx': { 'STX': 2.0, 'VELAR': 10.0, 'aeUSDC': 1.0 },
      'STX': { 'USDCx': 0.5, 'VELAR': 5.0, 'aeUSDC': 0.5 },
      'VELAR': { 'USDCx': 0.1, 'STX': 0.2, 'aeUSDC': 0.1 },
      'aeUSDC': { 'USDCx': 1.0, 'STX': 2.0, 'VELAR': 10.0 },
    };

    let outputAmount = inputAmount;

    // Apply rates along the route
    for (let i = 0; i < route.path.length - 1; i++) {
      const from = this.getTokenSymbol(route.path[i]);
      const to = this.getTokenSymbol(route.path[i + 1]);
      const rate = rates[from]?.[to] || 1.0;
      outputAmount = BigInt(Math.floor(Number(outputAmount) * rate));
    }

    // Apply 0.3% swap fee per hop
    const feeMultiplier = Math.pow(0.997, route.path.length - 1);
    outputAmount = BigInt(Math.floor(Number(outputAmount) * feeMultiplier));

    return outputAmount;
  }

  /**
   * Calculate price impact percentage
   */
  private calculatePriceImpact(inputAmount: bigint, outputAmount: bigint): number {
    // Simplified calculation
    // In production, compare against spot price from pool reserves
    const impact = 0.5; // 0.5% for demo
    return impact;
  }

  /**
   * Get token symbol from address
   */
  private getTokenSymbol(tokenAddress: string): string {
    // Handle direct symbol input
    if (!tokenAddress.includes('.') && !tokenAddress.includes('0x')) {
      return tokenAddress;
    }
    
    if (tokenAddress === 'STX') return 'STX';
    if (tokenAddress.toLowerCase().includes('usdcx')) return 'aeUSDC'; // Map USDCx to aeUSDC for Velar
    if (tokenAddress.toLowerCase().includes('velar')) return 'VELAR';
    if (tokenAddress.toLowerCase().includes('aeusdc')) return 'aeUSDC';
    if (tokenAddress.toLowerCase().includes('abtc')) return 'aBTC';
    if (tokenAddress.toLowerCase().includes('welsh')) return 'WELSH';
    
    // Extract token name from contract address
    const parts = tokenAddress.split('.');
    if (parts.length === 2) {
      const tokenName = parts[1].toUpperCase();
      // Map common tokens
      if (tokenName === 'USDCX') return 'aeUSDC';
      return tokenName;
    }
    
    return tokenAddress;
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
        const usdcxBalance = BigInt(
          data.fungible_tokens?.[this.config.stacksUsdcxAddress]?.balance || '0'
        );

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
