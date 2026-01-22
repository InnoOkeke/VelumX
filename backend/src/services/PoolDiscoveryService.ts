/**
 * Pool Discovery Service
 * Discovers, indexes, and manages metadata for all available liquidity pools
 */

import { getExtendedConfig } from '../config';
import { logger } from '../utils/logger';
import { getCache, CACHE_KEYS, CACHE_TTL, withCache } from '../cache/redis';
import { liquidityService } from './LiquidityService';
import { 
  callReadOnlyFunction, 
  cvToJSON, 
  principalCV 
} from '@stacks/transactions';
import {
  Pool,
  Token,
  PoolMetadata,
  PoolComparison,
} from '../types/liquidity';
import { DEFAULT_TOKENS, RISK_CRITERIA } from '../config/liquidity';

/**
 * Pool Discovery Service Class
 * Handles pool discovery, indexing, and metadata management
 */
export class PoolDiscoveryService {
  private config = getExtendedConfig();
  private cache = getCache();
  private discoveryInterval: NodeJS.Timeout | null = null;
  private isDiscovering = false;

  constructor() {
    logger.info('PoolDiscoveryService initialized', {
      discoveryEnabled: this.config.liquidity.poolDiscoveryEnabled,
      discoveryInterval: this.config.liquidity.poolDiscoveryInterval,
    });

    // Start automatic pool discovery if enabled
    if (this.config.liquidity.poolDiscoveryEnabled) {
      this.startDiscovery();
    }
  }

  /**
   * Start automatic pool discovery
   */
  startDiscovery(): void {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
    }

    this.discoveryInterval = setInterval(
      () => this.discoverPools(),
      this.config.liquidity.poolDiscoveryInterval
    );

    logger.info('Pool discovery started', {
      interval: this.config.liquidity.poolDiscoveryInterval,
    });

    // Run initial discovery
    this.discoverPools().catch(error => {
      logger.error('Initial pool discovery failed', { error });
    });
  }

  /**
   * Stop automatic pool discovery
   */
  stopDiscovery(): void {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
      logger.info('Pool discovery stopped');
    }
  }

  /**
   * Discover all available pools
   */
  async discoverPools(): Promise<Pool[]> {
    if (this.isDiscovering) {
      logger.debug('Pool discovery already in progress, skipping');
      return [];
    }

    this.isDiscovering = true;
    logger.info('Starting pool discovery');

    try {
      const pools: Pool[] = [];
      const tokens = DEFAULT_TOKENS;

      // Generate all possible token pairs
      for (let i = 0; i < tokens.length; i++) {
        for (let j = i + 1; j < tokens.length; j++) {
          const tokenA = tokens[i];
          const tokenB = tokens[j];

          try {
            // Check if pool exists by trying to get reserves
            const reserves = await liquidityService.getPoolReserves(
              tokenA.address,
              tokenB.address
            );

            // If reserves exist and are non-zero, pool exists
            if (reserves.reserveA > BigInt(0) && reserves.reserveB > BigInt(0)) {
              const pool: Pool = {
                id: `${tokenA.symbol}-${tokenB.symbol}`,
                tokenA: {
                  symbol: tokenA.symbol,
                  name: tokenA.name,
                  address: tokenA.address,
                  decimals: tokenA.decimals,
                },
                tokenB: {
                  symbol: tokenB.symbol,
                  name: tokenB.name,
                  address: tokenB.address,
                  decimals: tokenB.decimals,
                },
                reserveA: reserves.reserveA,
                reserveB: reserves.reserveB,
                totalSupply: reserves.totalSupply,
                createdAt: new Date(), // TODO: Get actual creation date from events
                lastUpdated: new Date(),
              };

              pools.push(pool);
              logger.debug('Pool discovered', { poolId: pool.id });
            }
          } catch (error) {
            // Pool doesn't exist or error occurred, skip
            logger.debug('Pool not found or error', {
              tokenA: tokenA.symbol,
              tokenB: tokenB.symbol,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }
      }

      // Cache discovered pools
      await this.cache.set(CACHE_KEYS.POOL_LIST, pools, CACHE_TTL.POOL_LIST);

      logger.info('Pool discovery completed', { poolCount: pools.length });
      return pools;
    } catch (error) {
      logger.error('Pool discovery failed', { error });
      return [];
    } finally {
      this.isDiscovering = false;
    }
  }

  /**
   * Index new pools (manual trigger)
   */
  async indexNewPools(): Promise<void> {
    logger.info('Manual pool indexing triggered');
    await this.discoverPools();
  }

  /**
   * Get pool metadata
   */
  async getPoolMetadata(poolId: string): Promise<PoolMetadata> {
    const cacheKey = CACHE_KEYS.POOL_METADATA(poolId);
    
    return withCache(
      cacheKey,
      async () => {
        logger.debug('Fetching pool metadata', { poolId });

        // Parse pool ID to get token symbols
        const [tokenASymbol, tokenBSymbol] = poolId.split('-');
        
        // Find tokens in default list
        const tokenA = DEFAULT_TOKENS.find(t => t.symbol === tokenASymbol);
        const tokenB = DEFAULT_TOKENS.find(t => t.symbol === tokenBSymbol);

        // Calculate risk level based on pool characteristics
        let riskLevel: 'low' | 'medium' | 'high' = 'high';
        
        try {
          // Get pool reserves to calculate TVL (mock calculation)
          const reserves = await liquidityService.getPoolReserves(
            tokenA?.address || '',
            tokenB?.address || ''
          );

          // Mock TVL calculation (would need price data in production)
          const mockTVL = Number(reserves.reserveA) + Number(reserves.reserveB);
          
          if (mockTVL >= RISK_CRITERIA.LOW.minTVL && tokenA?.verified && tokenB?.verified) {
            riskLevel = 'low';
          } else if (mockTVL >= RISK_CRITERIA.MEDIUM.minTVL) {
            riskLevel = 'medium';
          }
        } catch (error) {
          logger.debug('Failed to calculate risk level', { poolId, error });
        }

        const metadata: PoolMetadata = {
          poolId,
          name: `${tokenASymbol}/${tokenBSymbol}`,
          description: `Liquidity pool for ${tokenASymbol} and ${tokenBSymbol}`,
          tags: [
            tokenASymbol.toLowerCase(),
            tokenBSymbol.toLowerCase(),
            'amm',
            'liquidity',
          ],
          verified: (tokenA?.verified && tokenB?.verified) || false,
          featured: poolId === 'USDCx-STX', // Feature the main pool
          riskLevel,
          category: 'defi',
        };

        return metadata;
      },
      CACHE_TTL.POOL_METADATA
    );
  }

  /**
   * Get all pools with metadata
   */
  async getAllPools(): Promise<Pool[]> {
    const cacheKey = CACHE_KEYS.POOL_LIST;
    
    return withCache(
      cacheKey,
      async () => {
        logger.debug('Fetching all pools');
        
        // Try to get from cache first, otherwise discover
        let pools = await this.cache.get<Pool[]>(cacheKey);
        
        if (!pools || pools.length === 0) {
          pools = await this.discoverPools();
        }

        return pools || [];
      },
      CACHE_TTL.POOL_LIST
    );
  }

  /**
   * Search pools by query
   */
  async searchPools(query: string): Promise<Pool[]> {
    logger.debug('Searching pools', { query });

    const allPools = await this.getAllPools();
    const searchTerm = query.toLowerCase();

    return allPools.filter(pool => {
      return (
        pool.tokenA.symbol.toLowerCase().includes(searchTerm) ||
        pool.tokenA.name.toLowerCase().includes(searchTerm) ||
        pool.tokenB.symbol.toLowerCase().includes(searchTerm) ||
        pool.tokenB.name.toLowerCase().includes(searchTerm) ||
        pool.id.toLowerCase().includes(searchTerm)
      );
    });
  }

  /**
   * Get popular pools (sorted by TVL)
   */
  async getPopularPools(limit: number = 10): Promise<Pool[]> {
    logger.debug('Fetching popular pools', { limit });

    const allPools = await this.getAllPools();
    
    // Sort by total supply as a proxy for popularity (would use TVL in production)
    return allPools
      .sort((a, b) => {
        const aSupply = Number(a.totalSupply);
        const bSupply = Number(b.totalSupply);
        return bSupply - aSupply;
      })
      .slice(0, limit);
  }

  /**
   * Get featured pools
   */
  async getFeaturedPools(): Promise<Pool[]> {
    logger.debug('Fetching featured pools');

    const allPools = await this.getAllPools();
    const featuredPoolIds = ['USDCx-STX']; // Define featured pools

    return allPools.filter(pool => featuredPoolIds.includes(pool.id));
  }

  /**
   * Validate that a pool exists
   */
  async validatePoolExists(tokenA: string, tokenB: string): Promise<boolean> {
    try {
      const reserves = await liquidityService.getPoolReserves(tokenA, tokenB);
      return reserves.reserveA > BigInt(0) && reserves.reserveB > BigInt(0);
    } catch (error) {
      logger.debug('Pool validation failed', { tokenA, tokenB, error });
      return false;
    }
  }

  /**
   * Get pool by token addresses
   */
  async getPoolByTokens(tokenA: string, tokenB: string): Promise<Pool | null> {
    logger.debug('Fetching pool by tokens', { tokenA, tokenB });

    const allPools = await this.getAllPools();
    
    return allPools.find(pool => {
      return (
        (pool.tokenA.address === tokenA && pool.tokenB.address === tokenB) ||
        (pool.tokenA.address === tokenB && pool.tokenB.address === tokenA)
      );
    }) || null;
  }

  /**
   * Get pools by token
   */
  async getPoolsByToken(tokenAddress: string): Promise<Pool[]> {
    logger.debug('Fetching pools by token', { tokenAddress });

    const allPools = await this.getAllPools();
    
    return allPools.filter(pool => {
      return pool.tokenA.address === tokenAddress || pool.tokenB.address === tokenAddress;
    });
  }

  /**
   * Get pool by ID
   */
  async getPoolById(poolId: string): Promise<Pool | null> {
    logger.debug('Fetching pool by ID', { poolId });

    const allPools = await this.getAllPools();
    
    return allPools.find(pool => pool.id === poolId) || null;
  }

  /**
   * Compare pool performance
   */
  async comparePoolPerformance(poolIds: string[]): Promise<PoolComparison> {
    logger.debug('Comparing pool performance', { poolIds });

    const allPools = await this.getAllPools();
    const pools = allPools.filter(pool => poolIds.includes(pool.id));

    const comparison: PoolComparison = {
      pools: pools.map(pool => ({
        poolId: pool.id,
        tvl: Number(pool.totalSupply), // Mock TVL
        apr: 0, // Would be calculated from analytics
        volume24h: 0, // Would be calculated from analytics
        feeEarnings24h: 0, // Would be calculated from analytics
        risk: 'medium' as const, // Would be calculated from metadata
      })),
      bestByTVL: '',
      bestByAPR: '',
      bestByVolume: '',
    };

    // Find best performers
    if (comparison.pools.length > 0) {
      comparison.bestByTVL = comparison.pools.reduce((best, current) => 
        current.tvl > best.tvl ? current : best
      ).poolId;

      comparison.bestByAPR = comparison.pools.reduce((best, current) => 
        current.apr > best.apr ? current : best
      ).poolId;

      comparison.bestByVolume = comparison.pools.reduce((best, current) => 
        current.volume24h > best.volume24h ? current : best
      ).poolId;
    }

    return comparison;
  }

  /**
   * Get pool statistics summary
   */
  async getPoolStatsSummary(): Promise<{
    totalPools: number;
    totalTVL: number;
    totalVolume24h: number;
    featuredPools: number;
  }> {
    const allPools = await this.getAllPools();
    const featuredPools = await this.getFeaturedPools();

    return {
      totalPools: allPools.length,
      totalTVL: allPools.reduce((sum, pool) => sum + Number(pool.totalSupply), 0),
      totalVolume24h: 0, // Would be calculated from analytics
      featuredPools: featuredPools.length,
    };
  }

  /**
   * Refresh pool data
   */
  async refreshPoolData(poolId?: string): Promise<void> {
    if (poolId) {
      logger.info('Refreshing specific pool data', { poolId });
      await this.cache.del(CACHE_KEYS.POOL_METADATA(poolId));
    } else {
      logger.info('Refreshing all pool data');
      await this.cache.del(CACHE_KEYS.POOL_LIST);
      await this.discoverPools();
    }
  }

  /**
   * Get discovery status
   */
  getDiscoveryStatus(): {
    enabled: boolean;
    running: boolean;
    interval: number;
    lastRun?: Date;
  } {
    return {
      enabled: this.config.liquidity.poolDiscoveryEnabled,
      running: this.isDiscovering,
      interval: this.config.liquidity.poolDiscoveryInterval,
      // lastRun would be tracked in production
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.stopDiscovery();
    logger.info('PoolDiscoveryService cleanup completed');
  }
}

// Export singleton instance
export const poolDiscoveryService = new PoolDiscoveryService();