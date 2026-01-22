/**
 * Swap Service
 * Handles token swaps on Stacks via our deployed swap contract
 */

import { getConfig } from '../config';
import { logger } from '../utils/logger';
import { callReadOnlyFunction, cvToJSON, principalCV, uintCV } from '@stacks/transactions';

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
        address: 'STX',
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
      const [contractAddress, contractName] = this.config.stacksSwapContractAddress.split('.');
      
      // Parse token addresses
      const [tokenInAddress, tokenInName] = inputToken.split('.');
      const [tokenOutAddress, tokenOutName] = outputToken.split('.');

      // Call quote-swap read-only function
      const result = await callReadOnlyFunction({
        contractAddress,
        contractName,
        functionName: 'quote-swap',
        functionArgs: [
          principalCV(`${tokenInAddress}.${tokenInName}`),
          principalCV(`${tokenOutAddress}.${tokenOutName}`),
          uintCV(inputAmount),
        ],
        network: 'testnet',
        senderAddress: contractAddress,
      });

      // Parse result
      const resultJson = cvToJSON(result);
      
      if (resultJson.success === false || !resultJson.value) {
        throw new Error('Pool not found or invalid quote');
      }

      const quoteData = resultJson.value.value;
      const outputAmount = BigInt(quoteData['amount-out'].value);
      const priceImpact = Number(quoteData['price-impact'].value) / 100; // Convert basis points to percentage
      const fee = BigInt(quoteData.fee.value);

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
