/**
 * Liquidity Service
 * Handles liquidity operations on Stacks via the deployed swap contract
 */

import { getExtendedConfig } from '../config';
import { logger } from '../utils/logger';
import { fetchWithRetry } from '../utils/fetch';
import { getCache, CACHE_KEYS, CACHE_TTL, withCache } from '../cache/redis';
import {
  fetchCallReadOnlyFunction,
  cvToJSON,
  principalCV,
  uintCV,
  contractPrincipalCV
} from '@stacks/transactions';
import { createNetwork } from '@stacks/network';
import {
  Token,
  PoolReserves,
  PoolShare,
  TransactionData,
  AddLiquidityParams,
  RemoveLiquidityParams,
  OptimalAmountParams,
  OptimalAmounts,
  ValidationResult,
  LiquidityPosition,
  PortfolioSummary,
} from '../types/liquidity';

/**
 * Liquidity Service Class
 * Interfaces with the swap contract's liquidity functions
 */
export class LiquidityService {
  private config = getExtendedConfig();
  private cache = getCache();
  private readonly STX_SENTINEL = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';

  constructor() {
    logger.info('LiquidityService initialized', {
      contractAddress: this.config.liquidity.swapContractAddress,
      cacheEnabled: this.config.liquidity.cacheEnabled,
    });
  }

  /**
   * Helper to sort tokens matching the contract logic
   */
  private sortTokens(tokenA: string, tokenB: string) {
    const pA = tokenA === 'STX' || tokenA === this.STX_SENTINEL ? this.STX_SENTINEL : tokenA;
    const pB = tokenB === 'STX' || tokenB === this.STX_SENTINEL ? this.STX_SENTINEL : tokenB;
    return pA < pB ? { a: pA, b: pB, isReversed: false } : { a: pB, b: pA, isReversed: true };
  }

  /**
   * Get pool reserves for a token pair
   */
  async getPoolReserves(tokenA: string, tokenB: string): Promise<PoolReserves> {
    const cacheKey = CACHE_KEYS.POOL_RESERVES(`${tokenA}-${tokenB}`);

    return withCache(
      cacheKey,
      async () => {
        logger.debug('Fetching pool reserves from contract', { tokenA, tokenB });

        try {
          const [contractAddress, contractName] = this.config.liquidity.swapContractAddress.split('.');

          const { a, b, isReversed } = this.sortTokens(tokenA, tokenB);

          const result = await fetchCallReadOnlyFunction({
            contractAddress,
            contractName,
            functionName: 'get-pool-reserves',
            functionArgs: [
              principalCV(a),
              principalCV(b),
            ],
            network: createNetwork({
              network: 'testnet',
              client: { baseUrl: this.config.stacksRpcUrl },
            }),
            senderAddress: contractAddress,
          });

          const resultJson = cvToJSON(result);

          if (!resultJson.success || !resultJson.value) {
            throw new Error('Pool not found');
          }

          const poolData = resultJson.value.value;
          const reserveA = BigInt(poolData['reserve-a'].value);
          const reserveB = BigInt(poolData['reserve-b'].value);

          return {
            reserveA: isReversed ? reserveB : reserveA,
            reserveB: isReversed ? reserveA : reserveB,
            totalSupply: BigInt(poolData['total-supply'].value),
          };
        } catch (error) {
          logger.error('Failed to fetch pool reserves', { tokenA, tokenB, error });
          throw new Error('Failed to fetch pool reserves');
        }
      },
      CACHE_TTL.POOL_RESERVES
    );
  }

  /**
   * Get user's LP token balance for a specific pool
   */
  async getUserLPBalance(userAddress: string, tokenA: string, tokenB: string): Promise<string> {
    const cacheKey = CACHE_KEYS.USER_LP_BALANCE(userAddress, `${tokenA}-${tokenB}`);

    return withCache(
      cacheKey,
      async () => {
        logger.debug('Fetching user LP balance from contract', { userAddress, tokenA, tokenB });

        try {
          const [contractAddress, contractName] = this.config.liquidity.swapContractAddress.split('.');

          const result = await fetchCallReadOnlyFunction({
            contractAddress,
            contractName,
            functionName: 'get-lp-balance',
            functionArgs: [
              principalCV(tokenA),
              principalCV(tokenB),
              principalCV(userAddress),
            ],
            network: createNetwork({
              network: 'testnet',
              client: { baseUrl: this.config.stacksRpcUrl },
            }),
            senderAddress: contractAddress,
          });

          const resultJson = cvToJSON(result);

          if (!resultJson.success || resultJson.value === null) {
            return '0';
          }

          const balance = BigInt(resultJson.value.value);
          return balance.toString();
        } catch (error) {
          logger.error('Failed to fetch user LP balance', { userAddress, tokenA, tokenB, error });
          return '0';
        }
      },
      CACHE_TTL.USER_LP_BALANCE
    );
  }

  /**
   * Get user's pool share information
   */
  async getPoolShare(userAddress: string, tokenA: string, tokenB: string): Promise<PoolShare> {
    const cacheKey = CACHE_KEYS.USER_LP_BALANCE(userAddress, `${tokenA}-${tokenB}-share`);

    return withCache(
      cacheKey,
      async () => {
        logger.debug('Calculating user pool share', { userAddress, tokenA, tokenB });

        try {
          // get-pool-share doesn't exist in contract, calculate manually
          const [reserves, userLpBalanceStr] = await Promise.all([
            this.getPoolReserves(tokenA, tokenB),
            this.getUserLPBalance(userAddress, tokenA, tokenB)
          ]);

          const userLpBalance = BigInt(userLpBalanceStr);
          const totalSupply = reserves.totalSupply;

          if (totalSupply === 0n || userLpBalance === 0n) {
            return {
              shareA: 0n,
              shareB: 0n,
              percentage: 0,
            };
          }

          // Calculate share of each token
          const shareA = (userLpBalance * reserves.reserveA) / totalSupply;
          const shareB = (userLpBalance * reserves.reserveB) / totalSupply;
          const percentage = Number((userLpBalance * 10000n) / totalSupply) / 100;

          return {
            shareA,
            shareB,
            percentage,
          };
        } catch (error) {
          logger.error('Failed to calculate user pool share', { userAddress, tokenA, tokenB, error });
          return {
            shareA: 0n,
            shareB: 0n,
            percentage: 0,
          };
        }
      },
      CACHE_TTL.USER_LP_BALANCE
    );
  }

  /**
   * Calculate optimal amounts for adding liquidity
   */
  async calculateOptimalAmounts(params: OptimalAmountParams): Promise<OptimalAmounts> {
    logger.debug('Calculating optimal liquidity amounts', params);

    try {
      // Get current pool reserves
      const reserves = await this.getPoolReserves(params.tokenA, params.tokenB);

      // If pool doesn't exist, return the provided amounts
      if (reserves.reserveA === BigInt(0) || reserves.reserveB === BigInt(0)) {
        return {
          amountA: params.amountA || BigInt(0),
          amountB: params.amountB || BigInt(0),
          ratio: 1,
          priceImpact: 0,
        };
      }

      let optimalAmountA: bigint;
      let optimalAmountB: bigint;

      if (params.amountA && !params.amountB) {
        // Calculate optimal amount B based on amount A
        optimalAmountA = params.amountA;
        optimalAmountB = (params.amountA * reserves.reserveB) / reserves.reserveA;
      } else if (params.amountB && !params.amountA) {
        // Calculate optimal amount A based on amount B
        optimalAmountB = params.amountB;
        optimalAmountA = (params.amountB * reserves.reserveA) / reserves.reserveB;
      } else if (params.amountA && params.amountB) {
        // Use the ratio that requires less of both tokens
        const ratioA = params.amountA * reserves.reserveB / reserves.reserveA;
        const ratioB = params.amountB * reserves.reserveA / reserves.reserveB;

        if (ratioA <= params.amountB) {
          optimalAmountA = params.amountA;
          optimalAmountB = ratioA;
        } else {
          optimalAmountA = ratioB;
          optimalAmountB = params.amountB;
        }
      } else {
        throw new Error('Either amountA or amountB must be provided');
      }

      // Calculate current ratio
      const ratio = Number(reserves.reserveA) / Number(reserves.reserveB);

      // Calculate price impact (minimal for liquidity addition)
      const priceImpact = 0; // Liquidity addition doesn't cause price impact

      return {
        amountA: optimalAmountA,
        amountB: optimalAmountB,
        ratio,
        priceImpact,
      };
    } catch (error) {
      logger.error('Failed to calculate optimal amounts', { params, error });
      throw new Error('Failed to calculate optimal amounts');
    }
  }

  /**
   * Prepare add liquidity transaction data
   */
  async addLiquidity(params: AddLiquidityParams): Promise<TransactionData> {
    logger.info('Preparing add liquidity transaction', {
      tokenA: params.tokenA,
      tokenB: params.tokenB,
      amountADesired: params.amountADesired.toString(),
      amountBDesired: params.amountBDesired.toString(),
      userAddress: params.userAddress,
    });

    try {
      // Validate parameters
      const validation = await this.validateLiquidityOperation(params);
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid liquidity parameters');
      }

      const [contractAddress, contractName] = this.config.liquidity.swapContractAddress.split('.');

      // Parse token addresses for contract call
      const tokenAParts = params.tokenA.split('.');
      const tokenBParts = params.tokenB.split('.');

      const functionArgs = [
        contractPrincipalCV(tokenAParts[0], tokenAParts[1]), // token-a
        contractPrincipalCV(tokenBParts[0], tokenBParts[1]), // token-b
        uintCV(params.amountADesired), // amount-a-desired
        uintCV(params.amountBDesired), // amount-b-desired
        uintCV(params.amountAMin), // amount-a-min
        uintCV(params.amountBMin), // amount-b-min
      ];

      return {
        contractAddress,
        contractName,
        functionName: params.gaslessMode ? 'add-liquidity-gasless' : 'add-liquidity',
        functionArgs,
        gaslessMode: params.gaslessMode || false,
        estimatedFee: BigInt(0), // Will be calculated by frontend
      };
    } catch (error) {
      logger.error('Failed to prepare add liquidity transaction', { params, error });
      throw error;
    }
  }

  /**
   * Prepare remove liquidity transaction data
   */
  async removeLiquidity(params: RemoveLiquidityParams): Promise<TransactionData> {
    logger.info('Preparing remove liquidity transaction', {
      tokenA: params.tokenA,
      tokenB: params.tokenB,
      liquidity: params.liquidity.toString(),
      userAddress: params.userAddress,
    });

    try {
      // Validate parameters
      const validation = await this.validateRemoveLiquidity(params);
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid remove liquidity parameters');
      }

      const [contractAddress, contractName] = this.config.liquidity.swapContractAddress.split('.');

      // Parse token addresses for contract call
      const tokenAParts = params.tokenA.split('.');
      const tokenBParts = params.tokenB.split('.');

      const functionArgs = [
        contractPrincipalCV(tokenAParts[0], tokenAParts[1]), // token-a
        contractPrincipalCV(tokenBParts[0], tokenBParts[1]), // token-b
        uintCV(params.liquidity), // liquidity
        uintCV(params.amountAMin), // amount-a-min
        uintCV(params.amountBMin), // amount-b-min
      ];

      return {
        contractAddress,
        contractName,
        functionName: params.gaslessMode ? 'remove-liquidity-gasless' : 'remove-liquidity',
        functionArgs,
        gaslessMode: params.gaslessMode || false,
        estimatedFee: BigInt(0), // Will be calculated by frontend
      };
    } catch (error) {
      logger.error('Failed to prepare remove liquidity transaction', { params, error });
      throw error;
    }
  }

  /**
   * Validate add liquidity operation parameters
   */
  async validateLiquidityOperation(params: AddLiquidityParams): Promise<ValidationResult> {
    try {
      // Basic parameter validation
      if (params.amountADesired <= BigInt(0) || params.amountBDesired <= BigInt(0)) {
        return {
          valid: false,
          error: 'Amounts must be greater than zero',
          suggestions: ['Enter valid token amounts'],
        };
      }

      if (params.tokenA === params.tokenB) {
        return {
          valid: false,
          error: 'Cannot add liquidity with identical tokens',
          suggestions: ['Select different tokens for the pair'],
        };
      }

      // Check user balances
      const balanceCheck = await this.checkUserBalances(
        params.userAddress,
        params.tokenA,
        params.tokenB,
        params.amountADesired,
        params.amountBDesired
      );

      if (!balanceCheck.valid) {
        return balanceCheck;
      }

      return { valid: true };
    } catch (error) {
      logger.error('Liquidity validation failed', { params, error });
      return {
        valid: false,
        error: 'Validation failed',
        suggestions: ['Please try again later'],
      };
    }
  }

  /**
   * Validate remove liquidity operation parameters
   */
  async validateRemoveLiquidity(params: RemoveLiquidityParams): Promise<ValidationResult> {
    try {
      // Basic parameter validation
      if (params.liquidity <= BigInt(0)) {
        return {
          valid: false,
          error: 'LP token amount must be greater than zero',
          suggestions: ['Enter a valid LP token amount'],
        };
      }

      if (params.tokenA === params.tokenB) {
        return {
          valid: false,
          error: 'Invalid token pair',
          suggestions: ['Check the token addresses'],
        };
      }

      // Check user LP balance
      const userLPBalance = await this.getUserLPBalance(params.userAddress, params.tokenA, params.tokenB);
      const userBalance = BigInt(userLPBalance);

      if (userBalance < params.liquidity) {
        return {
          valid: false,
          error: 'Insufficient LP token balance',
          suggestions: [
            `You have ${userBalance.toString()} LP tokens`,
            `You're trying to remove ${params.liquidity.toString()} LP tokens`,
            'Reduce the amount or check your balance',
          ],
        };
      }

      return { valid: true };
    } catch (error) {
      logger.error('Remove liquidity validation failed', { params, error });
      return {
        valid: false,
        error: 'Validation failed',
        suggestions: ['Please try again later'],
      };
    }
  }

  /**
   * Check user token balances
   */
  private async checkUserBalances(
    userAddress: string,
    tokenA: string,
    tokenB: string,
    amountA: bigint,
    amountB: bigint
  ): Promise<ValidationResult> {
    try {
      const response = await fetchWithRetry(
        `${this.config.stacksRpcUrl}/extended/v1/address/${userAddress}/balances`
      );

      const data: any = await response.json();

      // Check token A balance
      if (tokenA.includes('usdcx')) {
        const tokenABalance = BigInt(
          data.fungible_tokens?.[tokenA]?.balance || '0'
        );

        if (tokenABalance < amountA) {
          return {
            valid: false,
            error: `Insufficient ${tokenA} balance`,
            suggestions: [
              `Required: ${amountA.toString()}`,
              `Available: ${tokenABalance.toString()}`,
              'Add more tokens to your wallet',
            ],
          };
        }
      }

      // Check token B balance (if not STX)
      if (!tokenB.includes('STX') && tokenB.includes('.')) {
        const tokenBBalance = BigInt(
          data.fungible_tokens?.[tokenB]?.balance || '0'
        );

        if (tokenBBalance < amountB) {
          return {
            valid: false,
            error: `Insufficient ${tokenB} balance`,
            suggestions: [
              `Required: ${amountB.toString()}`,
              `Available: ${tokenBBalance.toString()}`,
              'Add more tokens to your wallet',
            ],
          };
        }
      }

      // Check STX balance if one of the tokens is STX
      if (tokenA === 'STX' || tokenB === 'STX') {
        const stxBalance = BigInt(data.stx.balance);
        const requiredSTX = tokenA === 'STX' ? amountA : amountB;

        if (stxBalance < requiredSTX) {
          return {
            valid: false,
            error: 'Insufficient STX balance',
            suggestions: [
              `Required: ${requiredSTX.toString()}`,
              `Available: ${stxBalance.toString()}`,
              'Add more STX to your wallet',
            ],
          };
        }
      }

      return { valid: true };
    } catch (error) {
      logger.error('Failed to check user balances', { userAddress, error });
      return {
        valid: false,
        error: 'Failed to check balances',
        suggestions: ['Please try again later'],
      };
    }
  }

  /**
   * Calculate expected output amounts when removing liquidity
   */
  async calculateRemoveAmounts(
    userAddress: string,
    tokenA: string,
    tokenB: string,
    lpTokenAmount: bigint
  ): Promise<{ amountA: bigint; amountB: bigint }> {
    logger.debug('Calculating remove liquidity amounts', {
      userAddress,
      tokenA,
      tokenB,
      lpTokenAmount: lpTokenAmount.toString(),
    });

    try {
      // Get pool reserves
      const reserves = await this.getPoolReserves(tokenA, tokenB);

      if (reserves.totalSupply === BigInt(0)) {
        throw new Error('Pool has no liquidity');
      }

      // Calculate proportional amounts
      const amountA = (lpTokenAmount * reserves.reserveA) / reserves.totalSupply;
      const amountB = (lpTokenAmount * reserves.reserveB) / reserves.totalSupply;

      return { amountA, amountB };
    } catch (error) {
      logger.error('Failed to calculate remove amounts', {
        userAddress,
        tokenA,
        tokenB,
        lpTokenAmount: lpTokenAmount.toString(),
        error,
      });
      throw new Error('Failed to calculate remove amounts');
    }
  }

  /**
   * Calculate price impact for liquidity operations
   */
  async calculatePriceImpact(
    tokenA: string,
    tokenB: string,
    amountA: bigint,
    amountB: bigint
  ): Promise<number> {
    try {
      // Get current pool reserves
      const reserves = await this.getPoolReserves(tokenA, tokenB);

      // If pool doesn't exist, no price impact
      if (reserves.reserveA === BigInt(0) || reserves.reserveB === BigInt(0)) {
        return 0;
      }

      // Calculate current price
      const currentPrice = Number(reserves.reserveB) / Number(reserves.reserveA);

      // Calculate new reserves after liquidity addition
      const newReserveA = reserves.reserveA + amountA;
      const newReserveB = reserves.reserveB + amountB;

      // Calculate new price
      const newPrice = Number(newReserveB) / Number(newReserveA);

      // Calculate price impact as percentage
      const priceImpact = Math.abs((newPrice - currentPrice) / currentPrice) * 100;

      return priceImpact;
    } catch (error) {
      logger.error('Failed to calculate price impact', { tokenA, tokenB, error });
      return 0; // Return 0 on error
    }
  }

  /**
   * Calculate LP tokens to be minted for liquidity addition
   */
  async calculateLPTokensToMint(
    tokenA: string,
    tokenB: string,
    amountA: bigint,
    amountB: bigint
  ): Promise<bigint> {
    try {
      // Get current pool reserves
      const reserves = await this.getPoolReserves(tokenA, tokenB);

      // If pool doesn't exist, calculate initial LP tokens
      if (reserves.reserveA === BigInt(0) || reserves.reserveB === BigInt(0)) {
        // For first liquidity, LP tokens = sqrt(amountA * amountB)
        return this.sqrt(amountA * amountB);
      }

      // For subsequent liquidity, calculate proportional LP tokens
      const liquidityA = (amountA * reserves.totalSupply) / reserves.reserveA;
      const liquidityB = (amountB * reserves.totalSupply) / reserves.reserveB;

      // Return the minimum to maintain pool ratio
      return liquidityA < liquidityB ? liquidityA : liquidityB;
    } catch (error) {
      logger.error('Failed to calculate LP tokens to mint', { tokenA, tokenB, error });
      throw new Error('Failed to calculate LP tokens');
    }
  }

  /**
   * Calculate pool share percentage for a user
   */
  async calculatePoolSharePercentage(
    userAddress: string,
    tokenA: string,
    tokenB: string
  ): Promise<number> {
    try {
      const [userLPBalance, reserves] = await Promise.all([
        this.getUserLPBalance(userAddress, tokenA, tokenB),
        this.getPoolReserves(tokenA, tokenB),
      ]);

      const userBalance = BigInt(userLPBalance);

      if (reserves.totalSupply === BigInt(0) || userBalance === BigInt(0)) {
        return 0;
      }

      // Calculate percentage (multiply by 10000 for basis points, then divide by 100 for percentage)
      const percentage = Number((userBalance * BigInt(10000)) / reserves.totalSupply) / 100;

      return percentage;
    } catch (error) {
      logger.error('Failed to calculate pool share percentage', { userAddress, tokenA, tokenB, error });
      return 0;
    }
  }

  /**
   * Estimate gas fees for liquidity operations
   */
  async estimateGasFees(
    operation: 'add' | 'remove',
    gaslessMode: boolean = false
  ): Promise<bigint> {
    try {
      // Mock gas estimation - in production, this would call the contract
      // or use historical data to estimate gas costs

      if (gaslessMode) {
        return BigInt(0); // No gas fees in gasless mode
      }

      // Base gas costs (in microSTX)
      const baseGasCosts = {
        add: BigInt(50000), // ~0.05 STX
        remove: BigInt(40000), // ~0.04 STX
      };

      return baseGasCosts[operation];
    } catch (error) {
      logger.error('Failed to estimate gas fees', { operation, gaslessMode, error });
      return BigInt(100000); // Return conservative estimate on error
    }
  }

  /**
   * Calculate slippage tolerance amounts
   */
  calculateSlippageAmounts(
    amount: bigint,
    slippagePercentage: number
  ): { min: bigint; max: bigint } {
    const slippageBasisPoints = BigInt(Math.floor(slippagePercentage * 100));
    const basisPoints = BigInt(10000);

    const minAmount = (amount * (basisPoints - slippageBasisPoints)) / basisPoints;
    const maxAmount = (amount * (basisPoints + slippageBasisPoints)) / basisPoints;

    return {
      min: minAmount,
      max: maxAmount,
    };
  }

  /**
   * Simple integer square root implementation
   */
  private sqrt(n: bigint): bigint {
    if (n === BigInt(0)) return BigInt(0);
    if (n < BigInt(4)) return BigInt(1);

    let x = n;
    let y = (x + BigInt(1)) / BigInt(2);

    while (y < x) {
      x = y;
      y = (x + n / x) / BigInt(2);
    }

    return x;
  }

  /**
   * Clear cache for user-specific data
   */
  async clearUserCache(userAddress: string): Promise<void> {
    await Promise.all([
      this.cache.del(CACHE_KEYS.USER_POSITIONS(userAddress)),
      this.cache.del(CACHE_KEYS.USER_PORTFOLIO(userAddress)),
      this.cache.delPattern(`user:lp:${userAddress}:*`),
    ]);

    logger.debug('User liquidity cache cleared', { userAddress });
  }

  /**
   * Clear cache for pool-specific data
   */
  async clearPoolCache(poolId: string): Promise<void> {
    await Promise.all([
      this.cache.del(CACHE_KEYS.POOL_RESERVES(poolId)),
      this.cache.del(CACHE_KEYS.POOL_ANALYTICS(poolId)),
      this.cache.del(CACHE_KEYS.POOL_METADATA(poolId)),
    ]);

    logger.debug('Pool liquidity cache cleared', { poolId });
  }
}

// Export singleton instance
export const liquidityService = new LiquidityService();