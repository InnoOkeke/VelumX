/**
 * Swap-Liquidity Integration Service
 * Ensures data consistency between swap and liquidity systems
 * Implements unified error handling across both systems
 * 
 * Validates Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 10.1, 10.2, 10.3, 10.4
 */

import { logger } from '../utils/logger';
import { invalidatePoolCache, invalidateUserCache, CACHE_KEYS, getCache } from '../cache/redis';
import { liquidityService } from './LiquidityService';
import { swapService } from './SwapService';
import { poolDiscoveryService } from './PoolDiscoveryService';
import { poolAnalyticsService } from './PoolAnalyticsService';

/**
 * Error types for unified error handling
 */
export enum ErrorType {
  CONTRACT_ERROR = 'CONTRACT_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  SLIPPAGE_EXCEEDED = 'SLIPPAGE_EXCEEDED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CACHE_ERROR = 'CACHE_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Unified error response structure
 */
export interface UnifiedError {
  type: ErrorType;
  code: string;
  message: string;
  details?: any;
  suggestions?: string[];
  retryable: boolean;
  timestamp: Date;
}

/**
 * Transaction event types for cache invalidation
 */
export enum TransactionEventType {
  SWAP_EXECUTED = 'SWAP_EXECUTED',
  LIQUIDITY_ADDED = 'LIQUIDITY_ADDED',
  LIQUIDITY_REMOVED = 'LIQUIDITY_REMOVED',
}

/**
 * Transaction event data
 */
export interface TransactionEvent {
  type: TransactionEventType;
  poolId: string;
  userAddress: string;
  tokenA: string;
  tokenB: string;
  timestamp: Date;
  txHash?: string;
}

/**
 * Token selection state for maintaining consistency across interfaces
 */
export interface TokenSelectionState {
  tokenA: string;
  tokenB: string;
  lastUpdated: Date;
  source: 'swap' | 'liquidity';
}

/**
 * Swap-Liquidity Integration Service
 * Manages data consistency and unified error handling between swap and liquidity systems
 */
export class SwapLiquidityIntegrationService {
  private cache = getCache();
  private tokenSelectionStates: Map<string, TokenSelectionState> = new Map();

  constructor() {
    logger.info('SwapLiquidityIntegrationService initialized');
  }

  /**
   * Handle transaction event and update all affected caches
   * Requirement 8.1: Update liquidity analytics when swaps occur
   */
  async handleTransactionEvent(event: TransactionEvent): Promise<void> {
    logger.info('Handling transaction event', {
      type: event.type,
      poolId: event.poolId,
      userAddress: event.userAddress,
    });

    try {
      // Invalidate pool-specific caches
      await this.invalidatePoolData(event.poolId);

      // Invalidate user-specific caches
      await this.invalidateUserData(event.userAddress);

      // Trigger analytics recalculation for the affected pool
      if (event.type === TransactionEventType.SWAP_EXECUTED) {
        // Swap affects pool reserves and analytics
        await this.refreshPoolAnalytics(event.poolId);
      } else if (
        event.type === TransactionEventType.LIQUIDITY_ADDED ||
        event.type === TransactionEventType.LIQUIDITY_REMOVED
      ) {
        // Liquidity changes affect pool reserves, analytics, and swap pricing
        await this.refreshPoolAnalytics(event.poolId);
        await this.refreshSwapPricing(event.tokenA, event.tokenB);
      }

      logger.info('Transaction event handled successfully', {
        type: event.type,
        poolId: event.poolId,
      });
    } catch (error) {
      logger.error('Failed to handle transaction event', { event, error });
      throw this.createUnifiedError(
        ErrorType.CACHE_ERROR,
        'Failed to update system state after transaction',
        error,
        ['Transaction completed but cache update failed', 'Data will refresh automatically'],
        false
      );
    }
  }

  /**
   * Invalidate all pool-related data
   * Requirement 8.3: Immediately reflect changes in swap pricing and available liquidity
   */
  private async invalidatePoolData(poolId: string): Promise<void> {
    logger.debug('Invalidating pool data', { poolId });

    try {
      // Use the centralized cache invalidation function
      await invalidatePoolCache(poolId);

      // Also clear swap service cache if it has pool-related data
      swapService.clearCache();

      logger.debug('Pool data invalidated', { poolId });
    } catch (error) {
      logger.error('Failed to invalidate pool data', { poolId, error });
      // Don't throw - graceful degradation
    }
  }

  /**
   * Invalidate all user-related data
   * Requirement 8.1: Update liquidity analytics in real-time
   */
  private async invalidateUserData(userAddress: string): Promise<void> {
    logger.debug('Invalidating user data', { userAddress });

    try {
      // Use the centralized cache invalidation function
      await invalidateUserCache(userAddress);

      // Clear liquidity service user cache
      await liquidityService.clearUserCache(userAddress);

      logger.debug('User data invalidated', { userAddress });
    } catch (error) {
      logger.error('Failed to invalidate user data', { userAddress, error });
      // Don't throw - graceful degradation
    }
  }

  /**
   * Refresh pool analytics after transaction
   * Requirement 8.1: Update liquidity analytics when swaps occur
   */
  private async refreshPoolAnalytics(poolId: string): Promise<void> {
    logger.debug('Refreshing pool analytics', { poolId });

    try {
      // Trigger analytics recalculation (will be cached)
      await poolAnalyticsService.getPoolAnalytics(poolId);

      logger.debug('Pool analytics refreshed', { poolId });
    } catch (error) {
      logger.error('Failed to refresh pool analytics', { poolId, error });
      // Don't throw - analytics will be recalculated on next request
    }
  }

  /**
   * Refresh swap pricing after liquidity changes
   * Requirement 8.3: Immediately reflect changes in swap pricing
   */
  private async refreshSwapPricing(tokenA: string, tokenB: string): Promise<void> {
    logger.debug('Refreshing swap pricing', { tokenA, tokenB });

    try {
      // Clear swap service cache to force fresh pricing
      swapService.clearCache();

      logger.debug('Swap pricing refreshed', { tokenA, tokenB });
    } catch (error) {
      logger.error('Failed to refresh swap pricing', { tokenA, tokenB, error });
      // Don't throw - pricing will be recalculated on next request
    }
  }

  /**
   * Maintain consistent token selections across interfaces
   * Requirement 8.2: Maintain consistent token selections and user preferences
   */
  async setTokenSelection(
    userAddress: string,
    tokenA: string,
    tokenB: string,
    source: 'swap' | 'liquidity'
  ): Promise<void> {
    logger.debug('Setting token selection', { userAddress, tokenA, tokenB, source });

    const state: TokenSelectionState = {
      tokenA,
      tokenB,
      lastUpdated: new Date(),
      source,
    };

    // Store in memory (could be persisted to cache/database)
    this.tokenSelectionStates.set(userAddress, state);

    // Also cache for cross-session persistence
    const cacheKey = `user:token-selection:${userAddress}`;
    await this.cache.set(cacheKey, state, 3600); // 1 hour TTL

    logger.debug('Token selection saved', { userAddress, state });
  }

  /**
   * Get user's last token selection
   * Requirement 8.2: Maintain consistent token selections across interfaces
   */
  async getTokenSelection(userAddress: string): Promise<TokenSelectionState | null> {
    logger.debug('Getting token selection', { userAddress });

    // Check memory first
    const memoryState = this.tokenSelectionStates.get(userAddress);
    if (memoryState) {
      return memoryState;
    }

    // Check cache
    const cacheKey = `user:token-selection:${userAddress}`;
    const cachedState = await this.cache.get<TokenSelectionState>(cacheKey);
    if (cachedState) {
      // Restore to memory
      this.tokenSelectionStates.set(userAddress, cachedState);
      return cachedState;
    }

    return null;
  }

  /**
   * Ensure data consistency across components
   * Requirement 8.4: Use consistent data models and caching strategies
   */
  async ensureDataConsistency(poolId: string): Promise<{
    consistent: boolean;
    issues: string[];
  }> {
    logger.debug('Checking data consistency', { poolId });

    const issues: string[] = [];

    try {
      // Parse pool ID
      const [tokenA, tokenB] = poolId.split('-');
      if (!tokenA || !tokenB) {
        issues.push('Invalid pool ID format');
        return { consistent: false, issues };
      }

      // Get pool data from different sources
      const [poolReserves, poolMetadata, poolAnalytics] = await Promise.allSettled([
        liquidityService.getPoolReserves(tokenA, tokenB),
        poolDiscoveryService.getPoolMetadata(poolId),
        poolAnalyticsService.getPoolAnalytics(poolId),
      ]);

      // Check if all data sources are accessible
      if (poolReserves.status === 'rejected') {
        issues.push('Failed to fetch pool reserves');
      }
      if (poolMetadata.status === 'rejected') {
        issues.push('Failed to fetch pool metadata');
      }
      if (poolAnalytics.status === 'rejected') {
        issues.push('Failed to fetch pool analytics');
      }

      // If we have reserves and analytics, check consistency
      if (poolReserves.status === 'fulfilled' && poolAnalytics.status === 'fulfilled') {
        const reserves = poolReserves.value;
        const analytics = poolAnalytics.value;

        // Check if reserve values are consistent
        // (Analytics should be based on the same reserve data)
        if (reserves.reserveA === BigInt(0) && reserves.reserveB === BigInt(0)) {
          if (analytics.tvl > 0) {
            issues.push('Analytics show TVL but reserves are zero');
          }
        }
      }

      const consistent = issues.length === 0;

      logger.debug('Data consistency check completed', { poolId, consistent, issues });

      return { consistent, issues };
    } catch (error) {
      logger.error('Data consistency check failed', { poolId, error });
      issues.push('Consistency check failed due to error');
      return { consistent: false, issues };
    }
  }

  /**
   * Create unified error response
   * Requirement 8.5, 10.1, 10.2, 10.3, 10.4: Unified error handling and user feedback
   */
  createUnifiedError(
    type: ErrorType,
    message: string,
    details?: any,
    suggestions?: string[],
    retryable: boolean = false
  ): UnifiedError {
    const errorCode = this.generateErrorCode(type);

    const error: UnifiedError = {
      type,
      code: errorCode,
      message,
      details: details instanceof Error ? details.message : details,
      suggestions: suggestions || this.getDefaultSuggestions(type),
      retryable,
      timestamp: new Date(),
    };

    logger.error('Unified error created', error);

    return error;
  }

  /**
   * Generate error code from error type
   */
  private generateErrorCode(type: ErrorType): string {
    const timestamp = Date.now().toString(36);
    return `${type}_${timestamp}`;
  }

  /**
   * Get default suggestions for error type
   * Requirement 10.1, 10.2, 10.3: Provide user-friendly error messages with suggested solutions
   */
  private getDefaultSuggestions(type: ErrorType): string[] {
    switch (type) {
      case ErrorType.CONTRACT_ERROR:
        return [
          'Check if the contract is deployed and accessible',
          'Verify network connectivity',
          'Try again in a few moments',
        ];
      case ErrorType.VALIDATION_ERROR:
        return [
          'Check your input parameters',
          'Ensure all required fields are filled',
          'Verify token addresses are correct',
        ];
      case ErrorType.INSUFFICIENT_BALANCE:
        return [
          'Check your wallet balance',
          'Ensure you have enough tokens for this operation',
          'Consider reducing the amount',
        ];
      case ErrorType.SLIPPAGE_EXCEEDED:
        return [
          'Increase slippage tolerance',
          'Reduce trade size',
          'Try again when market is less volatile',
        ];
      case ErrorType.NETWORK_ERROR:
        return [
          'Check your internet connection',
          'Verify the Stacks network is accessible',
          'Try again in a few moments',
        ];
      case ErrorType.CACHE_ERROR:
        return [
          'Data will refresh automatically',
          'Try refreshing the page',
          'Contact support if issue persists',
        ];
      default:
        return [
          'Try again later',
          'Contact support if issue persists',
        ];
    }
  }

  /**
   * Parse and classify error from any source
   * Requirement 8.5: Unified error handling across systems
   */
  parseError(error: any, context: string): UnifiedError {
    logger.debug('Parsing error', { context, error });

    // Check for specific error patterns
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();

      // Contract errors
      if (errorMessage.includes('contract') || errorMessage.includes('clarity')) {
        return this.createUnifiedError(
          ErrorType.CONTRACT_ERROR,
          'Contract interaction failed',
          error,
          undefined,
          true
        );
      }

      // Balance errors
      if (errorMessage.includes('insufficient') || errorMessage.includes('balance')) {
        return this.createUnifiedError(
          ErrorType.INSUFFICIENT_BALANCE,
          'Insufficient balance for this operation',
          error,
          undefined,
          false
        );
      }

      // Slippage errors
      if (errorMessage.includes('slippage') || errorMessage.includes('price')) {
        return this.createUnifiedError(
          ErrorType.SLIPPAGE_EXCEEDED,
          'Price moved beyond acceptable slippage',
          error,
          undefined,
          true
        );
      }

      // Network errors
      if (
        errorMessage.includes('network') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('fetch')
      ) {
        return this.createUnifiedError(
          ErrorType.NETWORK_ERROR,
          'Network request failed',
          error,
          undefined,
          true
        );
      }

      // Validation errors
      if (errorMessage.includes('invalid') || errorMessage.includes('validation')) {
        return this.createUnifiedError(
          ErrorType.VALIDATION_ERROR,
          'Invalid parameters provided',
          error,
          undefined,
          false
        );
      }
    }

    // Default to unknown error
    return this.createUnifiedError(
      ErrorType.UNKNOWN_ERROR,
      'An unexpected error occurred',
      error,
      undefined,
      true
    );
  }

  /**
   * Format error for API response
   * Requirement 10.1: Provide user-friendly error messages
   */
  formatErrorResponse(error: UnifiedError): {
    success: false;
    error: {
      code: string;
      message: string;
      suggestions?: string[];
      retryable: boolean;
    };
    timestamp: Date;
  } {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        suggestions: error.suggestions,
        retryable: error.retryable,
      },
      timestamp: error.timestamp,
    };
  }

  /**
   * Retry mechanism with exponential backoff
   * Requirement 10.4: Implement retry mechanisms with exponential backoff
   */
  async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 1000,
    context: string = 'operation'
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        logger.debug('Attempting operation', { context, attempt: attempt + 1, maxRetries });
        return await operation();
      } catch (error) {
        lastError = error;
        logger.warn('Operation failed, will retry', {
          context,
          attempt: attempt + 1,
          maxRetries,
          error,
        });

        // Don't retry on non-retryable errors
        const unifiedError = this.parseError(error, context);
        if (!unifiedError.retryable) {
          throw unifiedError;
        }

        // Calculate delay with exponential backoff
        const delay = initialDelay * Math.pow(2, attempt);

        // Don't wait after the last attempt
        if (attempt < maxRetries - 1) {
          logger.debug('Waiting before retry', { delay, attempt: attempt + 1 });
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // All retries exhausted
    logger.error('All retry attempts exhausted', { context, maxRetries });
    throw this.parseError(lastError, context);
  }

  /**
   * Validate operation across both systems
   * Requirement 8.4: Use consistent data models and caching strategies
   */
  async validateCrossSystemOperation(params: {
    operation: 'swap' | 'add-liquidity' | 'remove-liquidity';
    tokenA: string;
    tokenB: string;
    userAddress: string;
    amount?: bigint;
  }): Promise<{ valid: boolean; error?: UnifiedError }> {
    logger.debug('Validating cross-system operation', params);

    try {
      // Check if pool exists
      const poolId = `${params.tokenA}-${params.tokenB}`;
      const pools = await poolDiscoveryService.getAllPools();
      const poolExists = pools.some((p) => p.id === poolId);

      if (!poolExists && params.operation === 'swap') {
        return {
          valid: false,
          error: this.createUnifiedError(
            ErrorType.VALIDATION_ERROR,
            'Pool does not exist for this token pair',
            undefined,
            ['Check if you have the correct token addresses', 'Pool may need to be created first'],
            false
          ),
        };
      }

      // Check data consistency
      if (poolExists) {
        const consistency = await this.ensureDataConsistency(poolId);
        if (!consistency.consistent) {
          logger.warn('Data consistency issues detected', {
            poolId,
            issues: consistency.issues,
          });
          // Don't fail the operation, but log the warning
        }
      }

      return { valid: true };
    } catch (error) {
      logger.error('Cross-system validation failed', { params, error });
      return {
        valid: false,
        error: this.parseError(error, 'cross-system-validation'),
      };
    }
  }

  /**
   * Get system health status
   * Requirement 8.4: Monitor system integration health
   */
  async getSystemHealth(): Promise<{
    healthy: boolean;
    services: {
      swap: boolean;
      liquidity: boolean;
      poolDiscovery: boolean;
      poolAnalytics: boolean;
      cache: boolean;
    };
    issues: string[];
  }> {
    logger.debug('Checking system health');

    const issues: string[] = [];
    const services = {
      swap: true,
      liquidity: true,
      poolDiscovery: true,
      poolAnalytics: true,
      cache: true,
    };

    try {
      // Check cache health
      const cacheHealthy = await this.cache.healthCheck();
      services.cache = cacheHealthy;
      if (!cacheHealthy) {
        issues.push('Cache service is not responding');
      }

      // Check if we can fetch pools
      try {
        await poolDiscoveryService.getAllPools();
      } catch (error) {
        services.poolDiscovery = false;
        issues.push('Pool discovery service failed');
      }

      // Check if we can get swap tokens
      try {
        await swapService.getSupportedTokens();
      } catch (error) {
        services.swap = false;
        issues.push('Swap service failed');
      }

      const healthy = issues.length === 0;

      logger.debug('System health check completed', { healthy, services, issues });

      return { healthy, services, issues };
    } catch (error) {
      logger.error('System health check failed', { error });
      return {
        healthy: false,
        services,
        issues: ['Health check failed due to error'],
      };
    }
  }
}

// Export singleton instance
export const swapLiquidityIntegrationService = new SwapLiquidityIntegrationService();
