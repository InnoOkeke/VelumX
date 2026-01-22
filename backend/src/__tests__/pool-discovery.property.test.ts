/**
 * Property-based tests for Pool Discovery Service
 * 
 * Property 3: Pool Discovery and Indexing Consistency
 * For any pool that exists in the swap contract, the pool discovery system should 
 * correctly identify, index, and cache the pool with accurate metadata.
 * 
 * Feature: liquidity-swap-integration, Property 3: Pool Discovery and Indexing Consistency
 * Validates: Requirements 3.1, 3.2, 3.3
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fc from 'fast-check';

// Mock logger first (before any imports that use it)
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock cache
vi.mock('../cache/redis', () => ({
  getCache: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    delPattern: vi.fn(),
  })),
  withCache: vi.fn((key, fn, ttl) => fn()),
  CACHE_KEYS: {
    POOL_LIST: 'pools:list',
    POOL_METADATA: (poolId: string) => `pool:metadata:${poolId}`,
    POOL_ANALYTICS: (poolId: string) => `pool:analytics:${poolId}`,
    TOKEN_PRICE: (tokenAddress: string) => `token:price:${tokenAddress}`,
  },
  CACHE_TTL: {
    POOL_LIST: 300,
    POOL_METADATA: 3600,
    POOL_ANALYTICS: 600,
    TOKEN_PRICE: 300,
  },
}));

// Mock config
vi.mock('../config', () => ({
  getExtendedConfig: vi.fn(() => ({
    liquidity: {
      poolDiscoveryEnabled: true,
      poolDiscoveryInterval: 60000,
      analyticsEnabled: true,
      analyticsUpdateInterval: 300000,
    },
    stacksRpcUrl: 'https://api.testnet.hiro.so',
  })),
}));

// Mock LiquidityService
vi.mock('../services/LiquidityService', () => ({
  liquidityService: {
    getPoolReserves: vi.fn(),
  },
}));

// Mock DEFAULT_TOKENS
vi.mock('../config/liquidity', () => ({
  DEFAULT_TOKENS: [
    {
      symbol: 'USDCx',
      name: 'USD Coin',
      address: 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard',
      decimals: 6,
      verified: true,
    },
    {
      symbol: 'STX',
      name: 'Stacks',
      address: 'STX',
      decimals: 6,
      verified: true,
    },
    {
      symbol: 'ALEX',
      name: 'Alex Token',
      address: 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.age000-governance-token',
      decimals: 8,
      verified: false,
    },
  ],
  RISK_CRITERIA: {
    LOW: { minTVL: 1000000 },
    MEDIUM: { minTVL: 100000 },
  },
}));

import { PoolDiscoveryService } from '../services/PoolDiscoveryService';
import { liquidityService } from '../services/LiquidityService';
import { Pool, PoolMetadata } from '../types/liquidity';

describe('Property 3: Pool Discovery and Indexing Consistency', () => {
  let poolDiscoveryService: PoolDiscoveryService;

  beforeEach(() => {
    vi.clearAllMocks();
    poolDiscoveryService = new PoolDiscoveryService();
    // Stop automatic discovery for tests
    poolDiscoveryService.stopDiscovery();
  });

  afterEach(() => {
    poolDiscoveryService.cleanup();
  });

  /**
   * Property: Pool Discovery Consistency
   * For any valid pool reserves returned by the contract, the discovery service
   * should create a consistent pool object with all required fields
   */
  it('should consistently discover and index pools with valid reserves', async () => {
    // Feature: liquidity-swap-integration, Property 3: Pool Discovery and Indexing Consistency
    await fc.assert(
      fc.asyncProperty(
        // Generate valid pool reserves data
        fc.record({
          reserveA: fc.bigInt({ min: 1n, max: 1000000000000n }),
          reserveB: fc.bigInt({ min: 1n, max: 1000000000000n }),
          totalSupply: fc.bigInt({ min: 1n, max: 1000000000000n }),
        }),
        async (mockReserves) => {
          // Setup: Mock successful contract call
          vi.mocked(liquidityService.getPoolReserves).mockResolvedValue(mockReserves);

          // Execute: Discover pools
          const discoveredPools = await poolDiscoveryService.discoverPools();

          // Verify: Should discover at least one pool (USDCx-STX from default tokens)
          expect(discoveredPools.length).toBeGreaterThan(0);

          // Verify: Each discovered pool has consistent structure
          for (const pool of discoveredPools) {
            // Pool should have all required fields
            expect(pool).toHaveProperty('id');
            expect(pool).toHaveProperty('tokenA');
            expect(pool).toHaveProperty('tokenB');
            expect(pool).toHaveProperty('reserveA');
            expect(pool).toHaveProperty('reserveB');
            expect(pool).toHaveProperty('totalSupply');
            expect(pool).toHaveProperty('createdAt');
            expect(pool).toHaveProperty('lastUpdated');

            // Pool ID should be consistent format
            expect(pool.id).toMatch(/^[A-Za-z0-9]+-[A-Za-z0-9]+$/);

            // Reserves should match contract data
            expect(pool.reserveA).toBe(mockReserves.reserveA);
            expect(pool.reserveB).toBe(mockReserves.reserveB);
            expect(pool.totalSupply).toBe(mockReserves.totalSupply);

            // Tokens should have required fields
            expect(pool.tokenA.symbol).toBeTruthy();
            expect(pool.tokenA.name).toBeTruthy();
            expect(pool.tokenA.address).toBeTruthy();
            expect(pool.tokenA.decimals).toBeGreaterThan(0);

            expect(pool.tokenB.symbol).toBeTruthy();
            expect(pool.tokenB.name).toBeTruthy();
            expect(pool.tokenB.address).toBeTruthy();
            expect(pool.tokenB.decimals).toBeGreaterThan(0);

            // Timestamps should be valid dates
            expect(pool.createdAt).toBeInstanceOf(Date);
            expect(pool.lastUpdated).toBeInstanceOf(Date);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Pool Metadata Consistency
   * For any valid pool ID, the metadata should be consistently generated
   * with all required fields and proper risk assessment
   */
  it('should generate consistent metadata for discovered pools', async () => {
    // Feature: liquidity-swap-integration, Property 3: Pool Discovery and Indexing Consistency
    await fc.assert(
      fc.asyncProperty(
        // Generate valid pool IDs from known token pairs
        fc.constantFrom('USDCx-STX', 'USDCx-ALEX', 'STX-ALEX'),
        fc.record({
          reserveA: fc.bigInt({ min: 100000n, max: 1000000000000n }),
          reserveB: fc.bigInt({ min: 100000n, max: 1000000000000n }),
          totalSupply: fc.bigInt({ min: 100000n, max: 1000000000000n }),
        }),
        async (poolId, mockReserves) => {
          // Setup: Mock contract call for reserves
          vi.mocked(liquidityService.getPoolReserves).mockResolvedValue(mockReserves);

          // Execute: Get pool metadata
          const metadata = await poolDiscoveryService.getPoolMetadata(poolId);

          // Verify: Metadata has all required fields
          expect(metadata).toHaveProperty('poolId');
          expect(metadata).toHaveProperty('name');
          expect(metadata).toHaveProperty('description');
          expect(metadata).toHaveProperty('tags');
          expect(metadata).toHaveProperty('verified');
          expect(metadata).toHaveProperty('featured');
          expect(metadata).toHaveProperty('riskLevel');
          expect(metadata).toHaveProperty('category');

          // Verify: Pool ID matches input
          expect(metadata.poolId).toBe(poolId);

          // Verify: Name follows expected format
          const [tokenA, tokenB] = poolId.split('-');
          expect(metadata.name).toBe(`${tokenA}/${tokenB}`);

          // Verify: Description is meaningful
          expect(metadata.description).toContain(tokenA);
          expect(metadata.description).toContain(tokenB);

          // Verify: Tags include relevant terms
          expect(metadata.tags).toContain(tokenA.toLowerCase());
          expect(metadata.tags).toContain(tokenB.toLowerCase());
          expect(metadata.tags).toContain('amm');
          expect(metadata.tags).toContain('liquidity');

          // Verify: Risk level is valid
          expect(['low', 'medium', 'high']).toContain(metadata.riskLevel);

          // Verify: Category is set
          expect(metadata.category).toBe('defi');

          // Verify: Boolean fields are boolean
          expect(typeof metadata.verified).toBe('boolean');
          expect(typeof metadata.featured).toBe('boolean');
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: Pool Search Consistency
   * For any search query, the results should be consistent and relevant
   */
  it('should return consistent search results for pool queries', async () => {
    // Feature: liquidity-swap-integration, Property 3: Pool Discovery and Indexing Consistency
    await fc.assert(
      fc.asyncProperty(
        // Generate search queries
        fc.oneof(
          fc.constantFrom('USDCx', 'STX', 'ALEX', 'usd', 'stacks'),
          fc.string({ minLength: 1, maxLength: 10 }).filter(s => s.trim().length > 0)
        ),
        fc.array(
          fc.record({
            id: fc.constantFrom('USDCx-STX', 'USDCx-ALEX', 'STX-ALEX'),
            tokenA: fc.record({
              symbol: fc.constantFrom('USDCx', 'STX', 'ALEX'),
              name: fc.constantFrom('USD Coin', 'Stacks', 'Alex Token'),
              address: fc.string(),
              decimals: fc.integer({ min: 6, max: 18 }),
            }),
            tokenB: fc.record({
              symbol: fc.constantFrom('USDCx', 'STX', 'ALEX'),
              name: fc.constantFrom('USD Coin', 'Stacks', 'Alex Token'),
              address: fc.string(),
              decimals: fc.integer({ min: 6, max: 18 }),
            }),
            reserveA: fc.bigInt({ min: 1n, max: 1000000000000n }),
            reserveB: fc.bigInt({ min: 1n, max: 1000000000000n }),
            totalSupply: fc.bigInt({ min: 1n, max: 1000000000000n }),
            createdAt: fc.date(),
            lastUpdated: fc.date(),
          }),
          { minLength: 0, maxLength: 5 }
        ),
        async (searchQuery, mockPools) => {
          // Setup: Mock getAllPools to return test pools
          vi.spyOn(poolDiscoveryService, 'getAllPools').mockResolvedValue(mockPools);

          // Execute: Search pools
          const searchResults = await poolDiscoveryService.searchPools(searchQuery);

          // Verify: Results are a subset of all pools
          expect(searchResults.length).toBeLessThanOrEqual(mockPools.length);

          // Verify: All results are relevant to the search query
          const lowerQuery = searchQuery.toLowerCase();
          for (const result of searchResults) {
            const isRelevant = 
              result.tokenA.symbol.toLowerCase().includes(lowerQuery) ||
              result.tokenA.name.toLowerCase().includes(lowerQuery) ||
              result.tokenB.symbol.toLowerCase().includes(lowerQuery) ||
              result.tokenB.name.toLowerCase().includes(lowerQuery) ||
              result.id.toLowerCase().includes(lowerQuery);
            
            expect(isRelevant).toBe(true);
          }

          // Verify: Results maintain pool structure
          for (const result of searchResults) {
            expect(result).toHaveProperty('id');
            expect(result).toHaveProperty('tokenA');
            expect(result).toHaveProperty('tokenB');
            expect(result).toHaveProperty('reserveA');
            expect(result).toHaveProperty('reserveB');
          }
        }
      ),
      { numRuns: 40 }
    );
  });

  /**
   * Property: Pool Validation Consistency
   * For any token pair, pool validation should be consistent with discovery results
   */
  it('should consistently validate pool existence', async () => {
    // Feature: liquidity-swap-integration, Property 3: Pool Discovery and Indexing Consistency
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          tokenA: fc.string({ minLength: 10, maxLength: 50 }),
          tokenB: fc.string({ minLength: 10, maxLength: 50 }),
          hasValidReserves: fc.boolean(),
        }),
        async ({ tokenA, tokenB, hasValidReserves }) => {
          // Setup: Mock contract response based on test condition
          if (hasValidReserves) {
            vi.mocked(liquidityService.getPoolReserves).mockResolvedValue({
              reserveA: BigInt(1000000),
              reserveB: BigInt(2000000),
              totalSupply: BigInt(1500000),
            });
          } else {
            // Mock either zero reserves or error
            const shouldError = Math.random() > 0.5;
            if (shouldError) {
              vi.mocked(liquidityService.getPoolReserves).mockRejectedValue(
                new Error('Pool not found')
              );
            } else {
              vi.mocked(liquidityService.getPoolReserves).mockResolvedValue({
                reserveA: BigInt(0),
                reserveB: BigInt(0),
                totalSupply: BigInt(0),
              });
            }
          }

          // Execute: Validate pool existence
          const exists = await poolDiscoveryService.validatePoolExists(tokenA, tokenB);

          // Verify: Validation result matches expected condition
          expect(exists).toBe(hasValidReserves);

          // Verify: Method was called with correct parameters
          expect(liquidityService.getPoolReserves).toHaveBeenCalledWith(tokenA, tokenB);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: Pool Sorting and Filtering Consistency
   * Popular pools should be consistently sorted by total supply (TVL proxy)
   */
  it('should consistently sort popular pools by total supply', async () => {
    // Feature: liquidity-swap-integration, Property 3: Pool Discovery and Indexing Consistency
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 5, maxLength: 15 }),
            tokenA: fc.record({
              symbol: fc.string({ minLength: 2, maxLength: 10 }),
              name: fc.string({ minLength: 5, maxLength: 20 }),
              address: fc.string(),
              decimals: fc.integer({ min: 6, max: 18 }),
            }),
            tokenB: fc.record({
              symbol: fc.string({ minLength: 2, maxLength: 10 }),
              name: fc.string({ minLength: 5, maxLength: 20 }),
              address: fc.string(),
              decimals: fc.integer({ min: 6, max: 18 }),
            }),
            reserveA: fc.bigInt({ min: 1n, max: 1000000000000n }),
            reserveB: fc.bigInt({ min: 1n, max: 1000000000000n }),
            totalSupply: fc.bigInt({ min: 1n, max: 1000000000000n }),
            createdAt: fc.date(),
            lastUpdated: fc.date(),
          }),
          { minLength: 2, maxLength: 10 }
        ),
        fc.integer({ min: 1, max: 5 }),
        async (mockPools, limit) => {
          // Setup: Mock getAllPools to return test pools
          vi.spyOn(poolDiscoveryService, 'getAllPools').mockResolvedValue(mockPools);

          // Execute: Get popular pools
          const popularPools = await poolDiscoveryService.getPopularPools(limit);

          // Verify: Results respect the limit
          expect(popularPools.length).toBeLessThanOrEqual(limit);
          expect(popularPools.length).toBeLessThanOrEqual(mockPools.length);

          // Verify: Results are sorted by total supply (descending)
          for (let i = 1; i < popularPools.length; i++) {
            const currentSupply = Number(popularPools[i].totalSupply);
            const previousSupply = Number(popularPools[i - 1].totalSupply);
            expect(currentSupply).toBeLessThanOrEqual(previousSupply);
          }

          // Verify: All returned pools exist in original set
          for (const pool of popularPools) {
            const originalPool = mockPools.find(p => p.id === pool.id);
            expect(originalPool).toBeDefined();
            expect(pool.totalSupply).toBe(originalPool!.totalSupply);
          }
        }
      ),
      { numRuns: 25 }
    );
  });

  /**
   * Property: Cache Consistency
   * Pool data should be consistent between cached and fresh lookups
   */
  it('should maintain consistency between cached and fresh pool data', async () => {
    // Feature: liquidity-swap-integration, Property 3: Pool Discovery and Indexing Consistency
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          reserveA: fc.bigInt({ min: 1000n, max: 1000000000000n }),
          reserveB: fc.bigInt({ min: 1000n, max: 1000000000000n }),
          totalSupply: fc.bigInt({ min: 1000n, max: 1000000000000n }),
        }),
        async (mockReserves) => {
          // Setup: Mock contract call
          vi.mocked(liquidityService.getPoolReserves).mockResolvedValue(mockReserves);

          // Execute: Get pools twice (first should cache, second should use cache)
          const firstCall = await poolDiscoveryService.getAllPools();
          const secondCall = await poolDiscoveryService.getAllPools();

          // Verify: Both calls return same number of pools
          expect(secondCall.length).toBe(firstCall.length);

          // Verify: Pool structure is consistent (ignoring timestamps which may differ)
          for (let i = 0; i < firstCall.length; i++) {
            const pool1 = firstCall[i];
            const pool2 = secondCall[i];

            expect(pool1.id).toBe(pool2.id);
            expect(pool1.reserveA).toBe(pool2.reserveA);
            expect(pool1.reserveB).toBe(pool2.reserveB);
            expect(pool1.totalSupply).toBe(pool2.totalSupply);
            expect(pool1.tokenA).toEqual(pool2.tokenA);
            expect(pool1.tokenB).toEqual(pool2.tokenB);
            
            // Timestamps should be valid dates (but may differ slightly)
            expect(pool1.createdAt).toBeInstanceOf(Date);
            expect(pool1.lastUpdated).toBeInstanceOf(Date);
            expect(pool2.createdAt).toBeInstanceOf(Date);
            expect(pool2.lastUpdated).toBeInstanceOf(Date);
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});