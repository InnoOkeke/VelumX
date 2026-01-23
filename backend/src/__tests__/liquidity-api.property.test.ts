/**
 * Property-based tests for Liquidity API parameter validation and responses
 * 
 * Property 2: API Parameter Validation and Response Format
 * For any API endpoint request with valid parameters, the system should return 
 * properly formatted responses with all required fields, and for invalid parameters, 
 * should return appropriate error messages.
 * 
 * Feature: liquidity-swap-integration, Property 2: API Parameter Validation and Response Format
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fc from 'fast-check';
import request from 'supertest';
import express, { Express } from 'express';

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
    POOL_RESERVES: (poolId: string) => `pool:reserves:${poolId}`,
    POOL_LIST: 'pools:list',
    POOL_METADATA: (poolId: string) => `pool:metadata:${poolId}`,
    USER_LP_BALANCE: (address: string, poolId: string) => `user:lp:${address}:${poolId}`,
    USER_POSITIONS: (address: string) => `user:positions:${address}`,
    USER_PORTFOLIO: (address: string) => `user:portfolio:${address}`,
    POOL_ANALYTICS: (poolId: string) => `pool:analytics:${poolId}`,
  },
  CACHE_TTL: {
    POOL_RESERVES: 30,
    POOL_LIST: 300,
    POOL_METADATA: 3600,
    USER_LP_BALANCE: 60,
    POOL_ANALYTICS: 300,
  },
}));

// Mock config
vi.mock('../config', () => ({
  getConfig: vi.fn(() => ({
    stacksRpcUrl: 'https://api.testnet.hiro.so',
    stacksNetwork: 'testnet',
    port: 3000,
  })),
  getExtendedConfig: vi.fn(() => ({
    liquidity: {
      swapContractAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.swap-contract',
      cacheEnabled: true,
      poolDiscoveryEnabled: true,
      poolDiscoveryInterval: 300000,
    },
    stacksRpcUrl: 'https://api.testnet.hiro.so',
  })),
}));

// Mock Stacks transactions
vi.mock('@stacks/transactions', () => ({
  callReadOnlyFunction: vi.fn(),
  cvToJSON: vi.fn(),
  principalCV: vi.fn(),
  uintCV: vi.fn(),
  contractPrincipalCV: vi.fn(),
}));

// Mock services
vi.mock('../services/LiquidityService', () => ({
  liquidityService: {
    addLiquidity: vi.fn(),
    removeLiquidity: vi.fn(),
    getPoolReserves: vi.fn(),
    getUserLPBalance: vi.fn(),
    getPoolShare: vi.fn(),
    calculateOptimalAmounts: vi.fn(),
    calculateRemoveAmounts: vi.fn(),
    validateLiquidityOperation: vi.fn(),
    validateRemoveLiquidity: vi.fn(),
  },
}));

vi.mock('../services/PoolDiscoveryService', () => ({
  poolDiscoveryService: {
    getAllPools: vi.fn(),
    searchPools: vi.fn(),
    getPoolMetadata: vi.fn(),
    getPopularPools: vi.fn(),
    getFeaturedPools: vi.fn(),
    getPoolStatsSummary: vi.fn(),
    refreshPoolData: vi.fn(),
    getDiscoveryStatus: vi.fn(),
    indexNewPools: vi.fn(),
  },
}));

// Import routes after mocks
import liquidityRoutes from '../routes/liquidity';
import { liquidityService } from '../services/LiquidityService';
import { poolDiscoveryService } from '../services/PoolDiscoveryService';

describe('Property 2: API Parameter Validation and Response Format', () => {
  let app: Express;

  beforeEach(() => {
    // Create a fresh Express app for each test
    app = express();
    app.use(express.json({ limit: '1mb' }));
    app.use('/api/liquidity', liquidityRoutes);
    
    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/liquidity/pools - Pool Listing Endpoint', () => {
    it('should return properly formatted response for valid pagination parameters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            page: fc.integer({ min: 1, max: 100 }),
            limit: fc.integer({ min: 1, max: 100 }),
            sortBy: fc.oneof(
              fc.constant('tvl'),
              fc.constant('volume'),
              fc.constant('apr'),
              fc.constant('created')
            ),
            sortOrder: fc.oneof(fc.constant('asc'), fc.constant('desc')),
          }),
          async (params) => {
            // Clear mocks for each iteration
            vi.clearAllMocks();
            
            // Setup: Mock successful pool discovery
            const mockPools = [
              {
                id: 'USDCx-STX',
                tokenA: { symbol: 'USDCx', name: 'USD Coin', address: 'ST1.usdcx', decimals: 6 },
                tokenB: { symbol: 'STX', name: 'Stacks', address: 'STX', decimals: 6 },
                reserveA: BigInt('1000000000'),
                reserveB: BigInt('500000000'),
                totalSupply: BigInt('707106781'),
                createdAt: new Date('2024-01-01'),
                lastUpdated: new Date(),
              },
            ];
            
            vi.mocked(poolDiscoveryService.getAllPools).mockResolvedValue(mockPools);

            // Execute: Call the endpoint with valid parameters
            const response = await request(app)
              .get('/api/liquidity/pools')
              .query({
                page: params.page.toString(),
                limit: params.limit.toString(),
                sortBy: params.sortBy,
                sortOrder: params.sortOrder,
              });

            // Verify: Should return 200 status
            expect(response.status).toBe(200);
            
            // Verify: Response should have proper structure
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('data');
            expect(response.body).toHaveProperty('pagination');
            
            // Verify: Pagination structure
            const pagination = response.body.pagination;
            expect(pagination).toHaveProperty('page', params.page);
            expect(pagination).toHaveProperty('limit', params.limit);
            expect(pagination).toHaveProperty('total');
            expect(pagination).toHaveProperty('hasNext');
            expect(pagination).toHaveProperty('hasPrev');
            expect(typeof pagination.total).toBe('number');
            expect(typeof pagination.hasNext).toBe('boolean');
            expect(typeof pagination.hasPrev).toBe('boolean');
            
            // Verify: Data structure
            expect(Array.isArray(response.body.data)).toBe(true);
            if (response.body.data.length > 0) {
              const pool = response.body.data[0];
              expect(pool).toHaveProperty('id');
              expect(pool).toHaveProperty('tokenA');
              expect(pool).toHaveProperty('tokenB');
              expect(pool).toHaveProperty('reserveA');
              expect(pool).toHaveProperty('reserveB');
              expect(pool).toHaveProperty('totalSupply');
              expect(typeof pool.reserveA).toBe('string'); // BigInt serialized as string
              expect(typeof pool.reserveB).toBe('string');
              expect(typeof pool.totalSupply).toBe('string');
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should return error for invalid pagination parameters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            page: fc.oneof(
              fc.integer({ max: 0 }), // Invalid: page <= 0
              fc.integer({ min: 1001 }), // Invalid: page too large
              fc.constant('invalid'), // Invalid: non-numeric
            ),
            limit: fc.oneof(
              fc.integer({ max: 0 }), // Invalid: limit <= 0
              fc.integer({ min: 1001 }), // Invalid: limit too large
              fc.constant('invalid'), // Invalid: non-numeric
            ),
          }),
          async (params) => {
            // Clear mocks for each iteration
            vi.clearAllMocks();

            // Execute: Call the endpoint with invalid parameters
            const response = await request(app)
              .get('/api/liquidity/pools')
              .query({
                page: params.page.toString(),
                limit: params.limit.toString(),
              });

            // Verify: Should return error status (400 or 500)
            expect([400, 500]).toContain(response.status);
            
            // Verify: Response should have error structure
            expect(response.body).toHaveProperty('success', false);
            expect(response.body).toHaveProperty('error');
            expect(typeof response.body.error).toBe('string');
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should handle search parameter correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          async (searchTerm) => {
            // Clear mocks for each iteration
            vi.clearAllMocks();
            
            // Setup: Mock search results
            const mockSearchResults = [
              {
                id: 'USDCx-STX',
                tokenA: { symbol: 'USDCx', name: 'USD Coin', address: 'ST1.usdcx', decimals: 6 },
                tokenB: { symbol: 'STX', name: 'Stacks', address: 'STX', decimals: 6 },
                reserveA: BigInt('1000000000'),
                reserveB: BigInt('500000000'),
                totalSupply: BigInt('707106781'),
                createdAt: new Date('2024-01-01'),
                lastUpdated: new Date(),
              },
            ];
            
            vi.mocked(poolDiscoveryService.searchPools).mockResolvedValue(mockSearchResults);

            // Execute: Call the endpoint with search parameter
            const response = await request(app)
              .get('/api/liquidity/pools')
              .query({ search: searchTerm });

            // Verify: Should return 200 status
            expect(response.status).toBe(200);
            
            // Verify: Should call search function
            expect(poolDiscoveryService.searchPools).toHaveBeenCalledWith(searchTerm);
            
            // Verify: Response structure
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('data');
            expect(Array.isArray(response.body.data)).toBe(true);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('POST /api/liquidity/add - Add Liquidity Endpoint', () => {
    it('should return properly formatted response for valid add liquidity parameters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tokenA: fc.constantFrom('ST1.usdcx', 'ST1.token-a'),
            tokenB: fc.constantFrom('STX', 'ST1.token-b'),
            amountADesired: fc.bigInt({ min: 1n, max: 1000000000000n }).map(n => n.toString()),
            amountBDesired: fc.bigInt({ min: 1n, max: 1000000000000n }).map(n => n.toString()),
            amountAMin: fc.bigInt({ min: 0n, max: 1000000000n }).map(n => n.toString()),
            amountBMin: fc.bigInt({ min: 0n, max: 1000000000n }).map(n => n.toString()),
            userAddress: fc.constant('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM'),
            gaslessMode: fc.boolean(),
          }),
          async (params) => {
            // Clear mocks for each iteration
            vi.clearAllMocks();
            
            // Setup: Mock successful validation and transaction preparation
            vi.mocked(liquidityService.validateLiquidityOperation).mockResolvedValue({ valid: true });
            vi.mocked(liquidityService.addLiquidity).mockResolvedValue({
              contractAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
              contractName: 'swap-contract',
              functionName: 'add-liquidity',
              functionArgs: [],
              gaslessMode: params.gaslessMode,
              estimatedFee: BigInt('50000'),
            });

            // Execute: Call the endpoint with valid parameters
            const response = await request(app)
              .post('/api/liquidity/add')
              .send(params);

            // Verify: Should return 200 status
            expect(response.status).toBe(200);
            
            // Verify: Response should have proper structure
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('data');
            
            // Verify: Transaction data structure
            const data = response.body.data;
            expect(data).toHaveProperty('contractAddress');
            expect(data).toHaveProperty('contractName');
            expect(data).toHaveProperty('functionName');
            expect(data).toHaveProperty('functionArgs');
            expect(data).toHaveProperty('gaslessMode', params.gaslessMode);
            expect(data).toHaveProperty('estimatedFee');
            expect(typeof data.estimatedFee).toBe('string'); // BigInt serialized as string
            
            // Verify: Service was called with correct parameters
            expect(liquidityService.addLiquidity).toHaveBeenCalledWith({
              tokenA: params.tokenA,
              tokenB: params.tokenB,
              amountADesired: BigInt(params.amountADesired),
              amountBDesired: BigInt(params.amountBDesired),
              amountAMin: BigInt(params.amountAMin || '0'),
              amountBMin: BigInt(params.amountBMin || '0'),
              userAddress: params.userAddress,
              gaslessMode: params.gaslessMode,
            });
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should return validation errors for invalid add liquidity parameters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tokenA: fc.oneof(
              fc.constant(''), // Invalid: empty string
              fc.constant('invalid-address'), // Invalid: malformed address
              fc.constant(null), // Invalid: null
            ),
            tokenB: fc.oneof(
              fc.constant(''), // Invalid: empty string
              fc.constant('invalid-address'), // Invalid: malformed address
            ),
            amountADesired: fc.oneof(
              fc.constant('0'), // Invalid: zero amount
              fc.constant('-1'), // Invalid: negative amount
              fc.constant('invalid'), // Invalid: non-numeric
              fc.constant(''), // Invalid: empty string
            ),
            amountBDesired: fc.oneof(
              fc.constant('0'), // Invalid: zero amount
              fc.constant('-1'), // Invalid: negative amount
              fc.constant('invalid'), // Invalid: non-numeric
            ),
            userAddress: fc.oneof(
              fc.constant(''), // Invalid: empty string
              fc.constant('invalid-address'), // Invalid: malformed address
            ),
          }),
          async (params) => {
            // Clear mocks for each iteration
            vi.clearAllMocks();

            // Execute: Call the endpoint with invalid parameters
            const response = await request(app)
              .post('/api/liquidity/add')
              .send(params);

            // Verify: Should return error status (400 or 500)
            expect([400, 500]).toContain(response.status);
            
            // Verify: Response should have error structure
            expect(response.body).toHaveProperty('success', false);
            expect(response.body).toHaveProperty('error');
            expect(typeof response.body.error).toBe('string');
            expect(response.body.error.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 40 }
      );
    });
  });

  describe('POST /api/liquidity/remove - Remove Liquidity Endpoint', () => {
    it('should return properly formatted response for valid remove liquidity parameters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tokenA: fc.constantFrom('ST1.usdcx', 'ST1.token-a'),
            tokenB: fc.constantFrom('STX', 'ST1.token-b'),
            liquidity: fc.bigInt({ min: 1n, max: 1000000000000n }).map(n => n.toString()),
            amountAMin: fc.bigInt({ min: 0n, max: 1000000000n }).map(n => n.toString()),
            amountBMin: fc.bigInt({ min: 0n, max: 1000000000n }).map(n => n.toString()),
            userAddress: fc.constant('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM'),
            gaslessMode: fc.boolean(),
          }),
          async (params) => {
            // Clear mocks for each iteration
            vi.clearAllMocks();
            
            // Setup: Mock successful validation and transaction preparation
            vi.mocked(liquidityService.validateRemoveLiquidity).mockResolvedValue({ valid: true });
            vi.mocked(liquidityService.removeLiquidity).mockResolvedValue({
              contractAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
              contractName: 'swap-contract',
              functionName: 'remove-liquidity',
              functionArgs: [],
              gaslessMode: params.gaslessMode,
              estimatedFee: BigInt('40000'),
            });

            // Execute: Call the endpoint with valid parameters
            const response = await request(app)
              .post('/api/liquidity/remove')
              .send(params);

            // Verify: Should return 200 status
            expect(response.status).toBe(200);
            
            // Verify: Response should have proper structure
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('data');
            
            // Verify: Transaction data structure
            const data = response.body.data;
            expect(data).toHaveProperty('contractAddress');
            expect(data).toHaveProperty('contractName');
            expect(data).toHaveProperty('functionName');
            expect(data).toHaveProperty('functionArgs');
            expect(data).toHaveProperty('gaslessMode', params.gaslessMode);
            expect(data).toHaveProperty('estimatedFee');
            expect(typeof data.estimatedFee).toBe('string'); // BigInt serialized as string
            
            // Verify: Service was called with correct parameters
            expect(liquidityService.removeLiquidity).toHaveBeenCalledWith({
              tokenA: params.tokenA,
              tokenB: params.tokenB,
              liquidity: BigInt(params.liquidity),
              amountAMin: BigInt(params.amountAMin || '0'),
              amountBMin: BigInt(params.amountBMin || '0'),
              userAddress: params.userAddress,
              gaslessMode: params.gaslessMode,
            });
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should return validation errors for invalid remove liquidity parameters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tokenA: fc.oneof(
              fc.constant(''), // Invalid: empty string
              fc.constant('same-token'), // Will be same as tokenB
            ),
            tokenB: fc.constant('same-token'), // Same as tokenA to test validation
            liquidity: fc.oneof(
              fc.constant('0'), // Invalid: zero amount
              fc.constant('-1'), // Invalid: negative amount
              fc.constant('invalid'), // Invalid: non-numeric
            ),
            userAddress: fc.oneof(
              fc.constant(''), // Invalid: empty string
              fc.constant('invalid-address'), // Invalid: malformed address
            ),
          }),
          async (params) => {
            // Clear mocks for each iteration
            vi.clearAllMocks();

            // Execute: Call the endpoint with invalid parameters
            const response = await request(app)
              .post('/api/liquidity/remove')
              .send(params);

            // Verify: Should return error status (400 or 500)
            expect([400, 500]).toContain(response.status);
            
            // Verify: Response should have error structure
            expect(response.body).toHaveProperty('success', false);
            expect(response.body).toHaveProperty('error');
            expect(typeof response.body.error).toBe('string');
            expect(response.body.error.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('GET /api/liquidity/positions/:address - User Positions Endpoint', () => {
    it('should return properly formatted response for valid user address', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
            'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG',
            'ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC'
          ),
          async (userAddress) => {
            // Clear mocks for each iteration
            vi.clearAllMocks();

            // Execute: Call the endpoint with valid address
            const response = await request(app)
              .get(`/api/liquidity/positions/${userAddress}`);

            // Verify: Should return 200 status
            expect(response.status).toBe(200);
            
            // Verify: Response should have proper structure
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('data');
            expect(response.body).toHaveProperty('pagination');
            
            // Verify: Data structure
            expect(Array.isArray(response.body.data)).toBe(true);
            
            // Verify: Pagination structure
            const pagination = response.body.pagination;
            expect(pagination).toHaveProperty('page');
            expect(pagination).toHaveProperty('limit');
            expect(pagination).toHaveProperty('total');
            expect(pagination).toHaveProperty('hasNext');
            expect(pagination).toHaveProperty('hasPrev');
            expect(typeof pagination.page).toBe('number');
            expect(typeof pagination.limit).toBe('number');
            expect(typeof pagination.total).toBe('number');
            expect(typeof pagination.hasNext).toBe('boolean');
            expect(typeof pagination.hasPrev).toBe('boolean');
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should return error for invalid user address format', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant(''), // Invalid: empty string
            fc.constant('invalid-address'), // Invalid: malformed address
            fc.constant('0x123'), // Invalid: wrong format
            fc.string({ minLength: 1, maxLength: 10 }), // Invalid: too short
          ),
          async (invalidAddress) => {
            // Clear mocks for each iteration
            vi.clearAllMocks();

            // Execute: Call the endpoint with invalid address
            const response = await request(app)
              .get(`/api/liquidity/positions/${invalidAddress}`);

            // Verify: Should return error status (400 or 500)
            expect([400, 500]).toContain(response.status);
            
            // Verify: Response should have error structure
            expect(response.body).toHaveProperty('success', false);
            expect(response.body).toHaveProperty('error');
            expect(typeof response.body.error).toBe('string');
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('POST /api/liquidity/calculate-optimal - Calculate Optimal Amounts Endpoint', () => {
    it('should return properly formatted response for valid calculation parameters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tokenA: fc.constantFrom('ST1.usdcx', 'ST1.token-a'),
            tokenB: fc.constantFrom('STX', 'ST1.token-b'),
            amountA: fc.option(fc.bigInt({ min: 1n, max: 1000000000000n }).map(n => n.toString())),
            amountB: fc.option(fc.bigInt({ min: 1n, max: 1000000000000n }).map(n => n.toString())),
          }).filter(params => params.amountA || params.amountB), // At least one amount must be provided
          async (params) => {
            // Clear mocks for each iteration
            vi.clearAllMocks();
            
            // Setup: Mock successful calculation
            vi.mocked(liquidityService.calculateOptimalAmounts).mockResolvedValue({
              amountA: BigInt('1000000000'),
              amountB: BigInt('500000000'),
              ratio: 2.0,
              priceImpact: 0.1,
            });

            // Execute: Call the endpoint with valid parameters
            const response = await request(app)
              .post('/api/liquidity/calculate-optimal')
              .send(params);

            // Verify: Should return 200 status
            expect(response.status).toBe(200);
            
            // Verify: Response should have proper structure
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('data');
            
            // Verify: Calculation result structure
            const data = response.body.data;
            expect(data).toHaveProperty('amountA');
            expect(data).toHaveProperty('amountB');
            expect(data).toHaveProperty('ratio');
            expect(data).toHaveProperty('priceImpact');
            expect(typeof data.amountA).toBe('string'); // BigInt serialized as string
            expect(typeof data.amountB).toBe('string');
            expect(typeof data.ratio).toBe('number');
            expect(typeof data.priceImpact).toBe('number');
            
            // Verify: Service was called with correct parameters
            expect(liquidityService.calculateOptimalAmounts).toHaveBeenCalledWith({
              tokenA: params.tokenA,
              tokenB: params.tokenB,
              amountA: params.amountA ? BigInt(params.amountA) : undefined,
              amountB: params.amountB ? BigInt(params.amountB) : undefined,
            });
          }
        ),
        { numRuns: 40 }
      );
    });

    it('should return validation errors for invalid calculation parameters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tokenA: fc.oneof(
              fc.constant(''), // Invalid: empty string
              fc.constant('same-token'), // Will be same as tokenB
            ),
            tokenB: fc.constant('same-token'), // Same as tokenA
            // No amounts provided - invalid
          }),
          async (params) => {
            // Clear mocks for each iteration
            vi.clearAllMocks();

            // Execute: Call the endpoint with invalid parameters
            const response = await request(app)
              .post('/api/liquidity/calculate-optimal')
              .send(params);

            // Verify: Should return error status (400 or 500)
            expect([400, 500]).toContain(response.status);
            
            // Verify: Response should have error structure
            expect(response.body).toHaveProperty('success', false);
            expect(response.body).toHaveProperty('error');
            expect(typeof response.body.error).toBe('string');
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Response Format Consistency', () => {
    it('should always include success field in responses', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            '/api/liquidity/pools',
            '/api/liquidity/pools/popular',
            '/api/liquidity/pools/featured',
            '/api/liquidity/pools/stats',
            '/api/liquidity/discovery/status'
          ),
          async (endpoint) => {
            // Clear mocks for each iteration
            vi.clearAllMocks();
            
            // Setup: Mock successful responses for all endpoints
            vi.mocked(poolDiscoveryService.getAllPools).mockResolvedValue([]);
            vi.mocked(poolDiscoveryService.getPopularPools).mockResolvedValue([]);
            vi.mocked(poolDiscoveryService.getFeaturedPools).mockResolvedValue([]);
            vi.mocked(poolDiscoveryService.getPoolStatsSummary).mockResolvedValue({
              totalPools: 0,
              totalTVL: 0,
              totalVolume24h: 0,
              featuredPools: 0,
            });
            vi.mocked(poolDiscoveryService.getDiscoveryStatus).mockReturnValue({
              enabled: true,
              running: false,
              interval: 300000,
            });

            // Execute: Call the endpoint
            const response = await request(app).get(endpoint);

            // Verify: Should always have success field
            expect(response.body).toHaveProperty('success');
            expect(typeof response.body.success).toBe('boolean');
            
            // Verify: If successful, should have data field
            if (response.body.success) {
              expect(response.body).toHaveProperty('data');
            } else {
              // If not successful, should have error field
              expect(response.body).toHaveProperty('error');
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should return consistent error format for all endpoints', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            endpoint: fc.constantFrom(
              '/api/liquidity/pools',
              '/api/liquidity/positions/invalid-address'
            ),
            errorType: fc.oneof(
              fc.constant(new Error('Service error')),
              fc.constant(new Error('Validation error'))
            ),
          }),
          async ({ endpoint, errorType }) => {
            // Clear mocks for each iteration
            vi.clearAllMocks();
            
            // Setup: Make services throw errors
            vi.mocked(poolDiscoveryService.getAllPools).mockRejectedValue(errorType);

            // Execute: Call the endpoint
            const response = await request(app).get(endpoint);

            // Verify: Should have consistent error format
            if (!response.body.success) {
              expect(response.body).toHaveProperty('success', false);
              expect(response.body).toHaveProperty('error');
              expect(typeof response.body.error).toBe('string');
              expect(response.body.error.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('BigInt Serialization', () => {
    it('should properly serialize BigInt values to strings in all responses', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            reserveA: fc.bigInt({ min: 1n, max: 1000000000000000n }),
            reserveB: fc.bigInt({ min: 1n, max: 1000000000000000n }),
            totalSupply: fc.bigInt({ min: 1n, max: 1000000000000000n }),
          }),
          async (reserves) => {
            // Clear mocks for each iteration
            vi.clearAllMocks();
            
            // Setup: Mock pools with BigInt values
            const mockPools = [
              {
                id: 'USDCx-STX',
                tokenA: { symbol: 'USDCx', name: 'USD Coin', address: 'ST1.usdcx', decimals: 6 },
                tokenB: { symbol: 'STX', name: 'Stacks', address: 'STX', decimals: 6 },
                reserveA: reserves.reserveA,
                reserveB: reserves.reserveB,
                totalSupply: reserves.totalSupply,
                createdAt: new Date('2024-01-01'),
                lastUpdated: new Date(),
              },
            ];
            
            vi.mocked(poolDiscoveryService.getAllPools).mockResolvedValue(mockPools);

            // Execute: Call the endpoint
            const response = await request(app).get('/api/liquidity/pools');

            // Verify: Should return 200 status
            expect(response.status).toBe(200);
            
            // Verify: BigInt values should be serialized as strings
            if (response.body.data.length > 0) {
              const pool = response.body.data[0];
              expect(typeof pool.reserveA).toBe('string');
              expect(typeof pool.reserveB).toBe('string');
              expect(typeof pool.totalSupply).toBe('string');
              
              // Verify: String values should be valid BigInt representations
              expect(() => BigInt(pool.reserveA)).not.toThrow();
              expect(() => BigInt(pool.reserveB)).not.toThrow();
              expect(() => BigInt(pool.totalSupply)).not.toThrow();
              
              // Verify: Values should match original BigInt values
              expect(BigInt(pool.reserveA)).toBe(reserves.reserveA);
              expect(BigInt(pool.reserveB)).toBe(reserves.reserveB);
              expect(BigInt(pool.totalSupply)).toBe(reserves.totalSupply);
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});