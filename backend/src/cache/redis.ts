/**
 * Redis Cache Configuration
 * Handles caching for liquidity pool data and analytics
 */

import { logger } from '../utils/logger';

// Cache configuration interface
interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
  defaultTTL: number;
}

// Cache key patterns
export const CACHE_KEYS = {
  POOL_RESERVES: (poolId: string) => `pool:reserves:${poolId}`,
  POOL_ANALYTICS: (poolId: string) => `pool:analytics:${poolId}`,
  USER_POSITIONS: (userAddress: string) => `user:positions:${userAddress}`,
  USER_LP_BALANCE: (userAddress: string, poolId: string) => `user:lp:${userAddress}:${poolId}`,
  POOL_LIST: 'pools:list',
  POOL_METADATA: (poolId: string) => `pool:metadata:${poolId}`,
  TOKEN_PRICE: (tokenAddress: string) => `token:price:${tokenAddress}`,
  POOL_HISTORY: (poolId: string, timeframe: string) => `pool:history:${poolId}:${timeframe}`,
  USER_PORTFOLIO: (userAddress: string) => `user:portfolio:${userAddress}`,
  FEE_EARNINGS: (userAddress: string, poolId: string) => `fees:${userAddress}:${poolId}`,
  SYSTEM_STATS: 'system:stats',
  USER_RECOMMENDATIONS: (userAddress: string) => `user:recommendations:${userAddress}`,
  POOL_RISK: (poolId: string) => `pool:risk:${poolId}`,
  USER_REBALANCING: (userAddress: string) => `user:rebalancing:${userAddress}`,
} as const;

// Cache TTL values (in seconds)
export const CACHE_TTL = {
  POOL_RESERVES: 30, // 30 seconds - frequently updated
  POOL_ANALYTICS: 300, // 5 minutes - moderate update frequency
  USER_POSITIONS: 60, // 1 minute - user-specific data
  USER_LP_BALANCE: 30, // 30 seconds - can change with transactions
  POOL_LIST: 600, // 10 minutes - relatively stable
  POOL_METADATA: 3600, // 1 hour - rarely changes
  TOKEN_PRICE: 60, // 1 minute - price data
  POOL_HISTORY: 1800, // 30 minutes - historical data
  USER_PORTFOLIO: 120, // 2 minutes - aggregated user data
  FEE_EARNINGS: 300, // 5 minutes - fee calculations
  SYSTEM_STATS: 600, // 10 minutes - system-wide stats
} as const;

/**
 * Redis Cache Client
 */
export class RedisCache {
  private client: Map<string, { value: any; expiry: number }> = new Map();
  private config: CacheConfig;
  private connected: boolean = false;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
  };

  constructor() {
    this.config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'velumx:liquidity:',
      defaultTTL: parseInt(process.env.REDIS_DEFAULT_TTL || '300'),
    };
  }

  /**
   * Initialize Redis connection
   */
  async initialize(): Promise<void> {
    try {
      // In-memory cache implementation for development
      // In production, replace with actual Redis client (ioredis or node-redis)
      logger.info('Redis cache initialized (in-memory mode)', {
        host: this.config.host,
        port: this.config.port,
        db: this.config.db,
      });
      
      this.connected = true;
      
      // Start cleanup interval to remove expired keys
      this.startCleanupInterval();
    } catch (error) {
      logger.error('Failed to initialize Redis cache', { error });
      throw error;
    }
  }

  /**
   * Start cleanup interval for expired keys
   */
  private startCleanupInterval(): void {
    // Clean up expired keys every 60 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredKeys();
    }, 60000);
  }

  /**
   * Clean up expired keys
   */
  private cleanupExpiredKeys(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.client.entries()) {
      if (entry.expiry > 0 && entry.expiry < now) {
        this.client.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.debug('Cleaned up expired cache keys', { count: cleaned });
    }
  }

  /**
   * Get value from cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    try {
      if (!this.connected) {
        logger.warn('Redis not connected, skipping cache get', { key });
        return null;
      }

      const fullKey = this.config.keyPrefix + key;
      const entry = this.client.get(fullKey);
      
      if (!entry) {
        this.stats.misses++;
        logger.debug('Cache MISS', { key: fullKey });
        return null;
      }
      
      // Check if expired
      if (entry.expiry > 0 && entry.expiry < Date.now()) {
        this.client.delete(fullKey);
        this.stats.misses++;
        logger.debug('Cache MISS (expired)', { key: fullKey });
        return null;
      }
      
      this.stats.hits++;
      logger.debug('Cache HIT', { key: fullKey });
      return entry.value as T;
    } catch (error) {
      logger.error('Cache GET failed', { key, error });
      return null; // Graceful degradation
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    try {
      if (!this.connected) {
        logger.warn('Redis not connected, skipping cache set', { key });
        return false;
      }

      const fullKey = this.config.keyPrefix + key;
      const cacheTTL = ttl || this.config.defaultTTL;
      
      // Calculate expiry timestamp (0 means no expiry)
      const expiry = cacheTTL > 0 ? Date.now() + (cacheTTL * 1000) : 0;
      
      this.client.set(fullKey, { value, expiry });
      this.stats.sets++;
      
      logger.debug('Cache SET', { key: fullKey, ttl: cacheTTL });
      return true;
    } catch (error) {
      logger.error('Cache SET failed', { key, error });
      return false; // Graceful degradation
    }
  }

  /**
   * Delete key from cache
   */
  async del(key: string): Promise<boolean> {
    try {
      if (!this.connected) {
        return false;
      }

      const fullKey = this.config.keyPrefix + key;
      const deleted = this.client.delete(fullKey);
      
      if (deleted) {
        this.stats.deletes++;
        logger.debug('Cache DEL', { key: fullKey });
      }
      
      return deleted;
    } catch (error) {
      logger.error('Cache DEL failed', { key, error });
      return false;
    }
  }

  /**
   * Delete multiple keys matching pattern
   */
  async delPattern(pattern: string): Promise<number> {
    try {
      if (!this.connected) {
        return 0;
      }

      const fullPattern = this.config.keyPrefix + pattern;
      let deleted = 0;
      
      // Convert glob pattern to regex
      const regexPattern = fullPattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      const regex = new RegExp(`^${regexPattern}$`);
      
      // Find and delete matching keys
      for (const key of this.client.keys()) {
        if (regex.test(key)) {
          this.client.delete(key);
          deleted++;
        }
      }
      
      if (deleted > 0) {
        this.stats.deletes += deleted;
        logger.debug('Cache DEL pattern', { pattern: fullPattern, deleted });
      }
      
      return deleted;
    } catch (error) {
      logger.error('Cache DEL pattern failed', { pattern, error });
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      if (!this.connected) {
        return false;
      }

      const fullKey = this.config.keyPrefix + key;
      const entry = this.client.get(fullKey);
      
      if (!entry) {
        return false;
      }
      
      // Check if expired
      if (entry.expiry > 0 && entry.expiry < Date.now()) {
        this.client.delete(fullKey);
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Cache EXISTS failed', { key, error });
      return false;
    }
  }

  /**
   * Set expiration time for key
   */
  async expire(key: string, ttl: number): Promise<boolean> {
    try {
      if (!this.connected) {
        return false;
      }

      const fullKey = this.config.keyPrefix + key;
      const entry = this.client.get(fullKey);
      
      if (!entry) {
        return false;
      }
      
      // Update expiry
      entry.expiry = Date.now() + (ttl * 1000);
      this.client.set(fullKey, entry);
      
      logger.debug('Cache EXPIRE', { key: fullKey, ttl });
      return true;
    } catch (error) {
      logger.error('Cache EXPIRE failed', { key, ttl, error });
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    connected: boolean;
    totalKeys: number;
    memoryUsage: number;
    hitRate: number;
  }> {
    try {
      const totalKeys = this.client.size;
      const totalRequests = this.stats.hits + this.stats.misses;
      const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
      
      // Estimate memory usage (rough calculation)
      let memoryUsage = 0;
      for (const [key, entry] of this.client.entries()) {
        memoryUsage += key.length * 2; // UTF-16 characters
        memoryUsage += JSON.stringify(entry.value).length * 2;
        memoryUsage += 16; // Overhead for expiry timestamp
      }
      
      return {
        connected: this.connected,
        totalKeys,
        memoryUsage,
        hitRate: Math.round(hitRate * 100) / 100,
      };
    } catch (error) {
      logger.error('Failed to get cache stats', { error });
      return {
        connected: false,
        totalKeys: 0,
        memoryUsage: 0,
        hitRate: 0,
      };
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    try {
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }
      
      this.client.clear();
      this.connected = false;
      logger.info('Redis cache connection closed');
    } catch (error) {
      logger.error('Error closing Redis connection', { error });
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.connected) {
        return false;
      }
      
      // Test set and get
      const testKey = 'health:check';
      const testValue = Date.now();
      
      await this.set(testKey, testValue, 10);
      const retrieved = await this.get(testKey);
      await this.del(testKey);
      
      return retrieved === testValue;
    } catch (error) {
      logger.error('Redis health check failed', { error });
      return false;
    }
  }

  /**
   * Clear all cache
   */
  async flushAll(): Promise<void> {
    try {
      if (!this.connected) {
        return;
      }
      
      this.client.clear();
      this.stats = {
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
      };
      
      logger.info('Cache flushed');
    } catch (error) {
      logger.error('Failed to flush cache', { error });
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): {
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
    hitRate: number;
  } {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
    
    return {
      ...this.stats,
      hitRate: Math.round(hitRate * 100) / 100,
    };
  }

  /**
   * Warm cache with frequently accessed data
   */
  async warmCache(keys: Array<{ key: string; fetcher: () => Promise<any>; ttl?: number }>): Promise<void> {
    logger.info('Starting cache warming', { keyCount: keys.length });
    
    try {
      const results = await Promise.allSettled(
        keys.map(async ({ key, fetcher, ttl }) => {
          try {
            // Check if already cached
            const exists = await this.exists(key);
            if (exists) {
              logger.debug('Cache key already warm', { key });
              return;
            }
            
            // Fetch and cache data
            const data = await fetcher();
            await this.set(key, data, ttl);
            logger.debug('Cache key warmed', { key });
          } catch (error) {
            logger.error('Failed to warm cache key', { key, error });
            throw error;
          }
        })
      );
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      logger.info('Cache warming completed', { successful, failed, total: keys.length });
    } catch (error) {
      logger.error('Cache warming failed', { error });
    }
  }

  /**
   * Get multiple keys at once (batch operation)
   */
  async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
    try {
      if (!this.connected) {
        return keys.map(() => null);
      }
      
      return Promise.all(keys.map(key => this.get<T>(key)));
    } catch (error) {
      logger.error('Cache MGET failed', { keys, error });
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple keys at once (batch operation)
   */
  async mset(entries: Array<{ key: string; value: any; ttl?: number }>): Promise<boolean[]> {
    try {
      if (!this.connected) {
        return entries.map(() => false);
      }
      
      return Promise.all(entries.map(({ key, value, ttl }) => this.set(key, value, ttl)));
    } catch (error) {
      logger.error('Cache MSET failed', { error });
      return entries.map(() => false);
    }
  }
}

// Singleton cache instance
let cacheInstance: RedisCache | null = null;

/**
 * Get cache instance
 */
export function getCache(): RedisCache {
  if (!cacheInstance) {
    cacheInstance = new RedisCache();
  }
  return cacheInstance;
}

/**
 * Initialize cache connection
 */
export async function initializeCache(): Promise<void> {
  const cache = getCache();
  await cache.initialize();
}

/**
 * Close cache connection
 */
export async function closeCache(): Promise<void> {
  if (cacheInstance) {
    await cacheInstance.close();
    cacheInstance = null;
  }
}

// Cache utility functions

/**
 * Cache wrapper function with automatic TTL
 */
export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl?: number
): Promise<T> {
  const cache = getCache();
  
  // Try to get from cache first
  const cached = await cache.get<T>(key);
  if (cached !== null) {
    logger.debug('Cache HIT', { key });
    return cached;
  }
  
  // Cache miss - fetch data
  logger.debug('Cache MISS', { key });
  const data = await fetcher();
  
  // Store in cache
  await cache.set(key, data, ttl);
  
  return data;
}

/**
 * Invalidate cache for user-specific data
 */
export async function invalidateUserCache(userAddress: string): Promise<void> {
  const cache = getCache();
  
  await Promise.all([
    cache.del(CACHE_KEYS.USER_POSITIONS(userAddress)),
    cache.del(CACHE_KEYS.USER_PORTFOLIO(userAddress)),
    cache.delPattern(`user:lp:${userAddress}:*`),
    cache.delPattern(`fees:${userAddress}:*`),
  ]);
  
  logger.debug('User cache invalidated', { userAddress });
}

/**
 * Invalidate cache for pool-specific data
 */
export async function invalidatePoolCache(poolId: string): Promise<void> {
  const cache = getCache();
  
  await Promise.all([
    cache.del(CACHE_KEYS.POOL_RESERVES(poolId)),
    cache.del(CACHE_KEYS.POOL_ANALYTICS(poolId)),
    cache.del(CACHE_KEYS.POOL_METADATA(poolId)),
    cache.del(CACHE_KEYS.POOL_LIST),
    cache.delPattern(`pool:history:${poolId}:*`),
  ]);
  
  logger.debug('Pool cache invalidated', { poolId });
}

/**
 * Cache warming service for frequently accessed data
 */
export class CacheWarmingService {
  private cache: RedisCache;
  private warmingInterval: NodeJS.Timeout | null = null;
  private isWarming: boolean = false;

  constructor() {
    this.cache = getCache();
  }

  /**
   * Start automatic cache warming
   */
  startAutoWarming(intervalMs: number = 300000): void {
    if (this.warmingInterval) {
      clearInterval(this.warmingInterval);
    }

    // Warm cache immediately
    this.warmFrequentlyAccessedData().catch(error => {
      logger.error('Initial cache warming failed', { error });
    });

    // Set up periodic warming
    this.warmingInterval = setInterval(() => {
      this.warmFrequentlyAccessedData().catch(error => {
        logger.error('Periodic cache warming failed', { error });
      });
    }, intervalMs);

    logger.info('Cache warming service started', { intervalMs });
  }

  /**
   * Stop automatic cache warming
   */
  stopAutoWarming(): void {
    if (this.warmingInterval) {
      clearInterval(this.warmingInterval);
      this.warmingInterval = null;
      logger.info('Cache warming service stopped');
    }
  }

  /**
   * Warm frequently accessed data
   */
  async warmFrequentlyAccessedData(): Promise<void> {
    if (this.isWarming) {
      logger.debug('Cache warming already in progress');
      return;
    }

    this.isWarming = true;
    logger.info('Starting cache warming for frequently accessed data');

    try {
      const warmingTasks: Array<{ key: string; fetcher: () => Promise<any>; ttl?: number }> = [];

      // Warm pool list (most frequently accessed)
      warmingTasks.push({
        key: CACHE_KEYS.POOL_LIST,
        fetcher: async () => {
          // This would call poolDiscoveryService.discoverPools()
          // For now, return empty array to avoid circular dependency
          return [];
        },
        ttl: CACHE_TTL.POOL_LIST,
      });

      // Warm system stats
      warmingTasks.push({
        key: CACHE_KEYS.SYSTEM_STATS,
        fetcher: async () => {
          return {
            totalPools: 0,
            totalTVL: 0,
            totalVolume24h: 0,
            lastUpdated: new Date(),
          };
        },
        ttl: CACHE_TTL.SYSTEM_STATS,
      });

      // Execute warming tasks
      await this.cache.warmCache(warmingTasks);

      logger.info('Cache warming completed successfully');
    } catch (error) {
      logger.error('Cache warming failed', { error });
    } finally {
      this.isWarming = false;
    }
  }

  /**
   * Warm cache for specific pool
   */
  async warmPoolCache(poolId: string): Promise<void> {
    logger.info('Warming cache for pool', { poolId });

    const warmingTasks: Array<{ key: string; fetcher: () => Promise<any>; ttl?: number }> = [];

    // Warm pool reserves
    warmingTasks.push({
      key: CACHE_KEYS.POOL_RESERVES(poolId),
      fetcher: async () => {
        // This would call liquidityService.getPoolReserves()
        return { reserveA: BigInt(0), reserveB: BigInt(0), totalSupply: BigInt(0) };
      },
      ttl: CACHE_TTL.POOL_RESERVES,
    });

    // Warm pool analytics
    warmingTasks.push({
      key: CACHE_KEYS.POOL_ANALYTICS(poolId),
      fetcher: async () => {
        // This would call poolAnalyticsService.getPoolAnalytics()
        return {
          poolId,
          tvl: 0,
          volume24h: 0,
          volume7d: 0,
          apr: 0,
          feeEarnings24h: 0,
          priceChange24h: 0,
          liquidityDepth: { bids: [], asks: [] },
          historicalData: [],
        };
      },
      ttl: CACHE_TTL.POOL_ANALYTICS,
    });

    // Warm pool metadata
    warmingTasks.push({
      key: CACHE_KEYS.POOL_METADATA(poolId),
      fetcher: async () => {
        // This would call poolDiscoveryService.getPoolMetadata()
        return {
          poolId,
          name: poolId,
          description: '',
          tags: [],
          verified: false,
          featured: false,
          riskLevel: 'medium' as const,
          category: 'defi',
        };
      },
      ttl: CACHE_TTL.POOL_METADATA,
    });

    await this.cache.warmCache(warmingTasks);
    logger.info('Pool cache warmed', { poolId });
  }

  /**
   * Warm cache for user data
   */
  async warmUserCache(userAddress: string, poolIds: string[]): Promise<void> {
    logger.info('Warming cache for user', { userAddress, poolCount: poolIds.length });

    const warmingTasks: Array<{ key: string; fetcher: () => Promise<any>; ttl?: number }> = [];

    // Warm user positions
    warmingTasks.push({
      key: CACHE_KEYS.USER_POSITIONS(userAddress),
      fetcher: async () => {
        // This would call positionTrackingService.getUserPositions()
        return [];
      },
      ttl: CACHE_TTL.USER_POSITIONS,
    });

    // Warm user portfolio
    warmingTasks.push({
      key: CACHE_KEYS.USER_PORTFOLIO(userAddress),
      fetcher: async () => {
        // This would call positionTrackingService.getPortfolioSummary()
        return {
          userAddress,
          totalValue: 0,
          totalFeeEarnings: 0,
          totalImpermanentLoss: 0,
          totalReturns: 0,
          positionCount: 0,
          positions: [],
        };
      },
      ttl: CACHE_TTL.USER_PORTFOLIO,
    });

    // Warm LP balances for each pool
    for (const poolId of poolIds) {
      warmingTasks.push({
        key: CACHE_KEYS.USER_LP_BALANCE(userAddress, poolId),
        fetcher: async () => {
          // This would call liquidityService.getUserLPBalance()
          return '0';
        },
        ttl: CACHE_TTL.USER_LP_BALANCE,
      });
    }

    await this.cache.warmCache(warmingTasks);
    logger.info('User cache warmed', { userAddress });
  }

  /**
   * Get warming status
   */
  getStatus(): {
    enabled: boolean;
    warming: boolean;
    lastRun?: Date;
  } {
    return {
      enabled: this.warmingInterval !== null,
      warming: this.isWarming,
      // lastRun would be tracked in production
    };
  }
}

// Export singleton instance
let warmingServiceInstance: CacheWarmingService | null = null;

export function getCacheWarmingService(): CacheWarmingService {
  if (!warmingServiceInstance) {
    warmingServiceInstance = new CacheWarmingService();
  }
  return warmingServiceInstance;
}