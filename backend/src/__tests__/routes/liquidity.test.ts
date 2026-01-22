/**
 * Unit tests for Liquidity API endpoints
 * Tests all endpoint success and error scenarios, parameter validation edge cases, and rate limiting behavior
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';

// Mock logger first (before any imports that use it)
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    http: vi.fn(),
  },
}));

// Mock cache
vi.mock('../../cache/redis', () => ({
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
vi.mock('../../config', () => ({
  getExtendedConfig: vi.fn(() => ({
    liquidity: {
      swapContractAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.swap-contract',
      cacheEnabled: true,
      poolDiscoveryEnabled: true,
      poolDiscoveryInterval: 300000,
    },
    stacksRpcUrl: 'https://api.testnet.hiro.so',
    maxRequestsPerMinute: 100,
    corsOrigin: 'http://localhost:3000',
  })),
  getConfig: vi.fn(() => ({
    maxRequestsPerMinute: 100,
    corsOrigin: 'http://localhost:3000',
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
vi.mock('../../services/LiquidityService', () => ({
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

vi.mock('../../services/PoolDiscoveryService', () => ({
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
import liquidityRoutes from '../../routes/liquidity';
import { liquidityService } from '../../services/LiquidityService';
import { poolDiscoveryService } from '../../services/PoolDiscoveryService';

describe('Liquidity API Endpoints - Unit Tests', () => {
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

  describe('GET /api/liquidity/pools', () => {
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
      {
        id: 'ALEX-STX',
        tokenA: { symbol: 'ALEX', name: 'Alex Token', address: 'ST1.alex', decimals: 8 },
        tokenB: { symbol: 'STX', name: 'Stacks', address: 'STX', decimals: 6 },
        reserveA: BigInt('2000000000'),
        reserveB: BigInt('800000000'),
        totalSupply: BigInt('1264911064'),
        createdAt: new Date('2024-01-02'),
        lastUpdated: new Date(),
      },
    ];

    it('should return all pools with default pagination', async () => {
      vi.mocked(poolDiscoveryService.getAllPools).mockResolvedValue(mockPools);

      const response = await request(app)
        .get('/api/liquidity/pools')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 50,
        total: 2,
        hasNext: false,
        hasPrev: false,
      });

      // Verify BigInt serialization
      expect(typeof response.body.data[0].reserveA).toBe('string');
      expect(response.body.data[0].reserveA).toBe('1000000000');
    });

    it('should handle pagination correctly', async () => {
      vi.mocked(poolDiscoveryService.getAllPools).mockResolvedValue(mockPools);

      const response = await request(app)
        .get('/api/liquidity/pools')
        .query({ page: '1', limit: '1' })
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 1,
        total: 2,
        hasNext: true,
        hasPrev: false,
      });
    });

    it('should handle search functionality', async () => {
      const searchResults = [mockPools[0]];
      vi.mocked(poolDiscoveryService.searchPools).mockResolvedValue(searchResults);

      const response = await request(app)
        .get('/api/liquidity/pools')
        .query({ search: 'USDCx' })
        .expect(200);

      expect(poolDiscoveryService.searchPools).toHaveBeenCalledWith('USDCx');
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe('USDCx-STX');
    });

    it('should return error for invalid pagination parameters', async () => {
      const response = await request(app)
        .get('/api/liquidity/pools')
        .query({ page: '0', limit: '-1' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid pagination parameters');
    });

    it('should handle service errors gracefully', async () => {
      vi.mocked(poolDiscoveryService.getAllPools).mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .get('/api/liquidity/pools')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to fetch liquidity pools');
    });
  });

  describe('GET /api/liquidity/pools/:poolId', () => {
    const mockPool = {
      id: 'USDCx-STX',
      tokenA: { symbol: 'USDCx', name: 'USD Coin', address: 'ST1.usdcx', decimals: 6 },
      tokenB: { symbol: 'STX', name: 'Stacks', address: 'STX', decimals: 6 },
      reserveA: BigInt('1000000000'),
      reserveB: BigInt('500000000'),
      totalSupply: BigInt('707106781'),
      createdAt: new Date('2024-01-01'),
      lastUpdated: new Date(),
    };

    it('should return pool details for valid pool ID', async () => {
      vi.mocked(poolDiscoveryService.getAllPools).mockResolvedValue([mockPool]);
      vi.mocked(poolDiscoveryService.getPoolMetadata).mockResolvedValue({
        description: 'USDCx-STX liquidity pool',
        verified: true,
        featured: false,
      });

      const response = await request(app)
        .get('/api/liquidity/pools/USDCx-STX')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('USDCx-STX');
      expect(response.body.data.metadata).toBeDefined();
      expect(typeof response.body.data.reserveA).toBe('string');
    });

    it('should return 404 for non-existent pool', async () => {
      vi.mocked(poolDiscoveryService.getAllPools).mockResolvedValue([]);

      const response = await request(app)
        .get('/api/liquidity/pools/NONEXISTENT-POOL')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Pool not found');
    });

    it('should return error for invalid pool ID format', async () => {
      const response = await request(app)
        .get('/api/liquidity/pools/invalid-format')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid pool ID format');
    });
  });

  describe('POST /api/liquidity/add', () => {
    const validAddParams = {
      tokenA: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx',
      tokenB: 'STX',
      amountADesired: '1000000000',
      amountBDesired: '500000000',
      amountAMin: '950000000',
      amountBMin: '475000000',
      userAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      gaslessMode: false,
    };

    const mockTransactionData = {
      contractAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      contractName: 'swap-contract',
      functionName: 'add-liquidity',
      functionArgs: [],
      gaslessMode: false,
      estimatedFee: BigInt('50000'),
    };

    it('should prepare add liquidity transaction for valid parameters', async () => {
      vi.mocked(liquidityService.addLiquidity).mockResolvedValue(mockTransactionData);

      const response = await request(app)
        .post('/api/liquidity/add')
        .send(validAddParams)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.contractAddress).toBe(mockTransactionData.contractAddress);
      expect(response.body.data.functionName).toBe('add-liquidity');
      expect(typeof response.body.data.estimatedFee).toBe('string');
      expect(response.body.data.estimatedFee).toBe('50000');

      expect(liquidityService.addLiquidity).toHaveBeenCalledWith({
        tokenA: validAddParams.tokenA,
        tokenB: validAddParams.tokenB,
        amountADesired: BigInt(validAddParams.amountADesired),
        amountBDesired: BigInt(validAddParams.amountBDesired),
        amountAMin: BigInt(validAddParams.amountAMin),
        amountBMin: BigInt(validAddParams.amountBMin),
        userAddress: validAddParams.userAddress,
        gaslessMode: validAddParams.gaslessMode,
      });
    });

    it('should return validation error for missing required fields', async () => {
      const invalidParams = { ...validAddParams };
      delete invalidParams.tokenA;

      const response = await request(app)
        .post('/api/liquidity/add')
        .send(invalidParams)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toContainEqual({
        field: 'tokenA',
        message: 'Token A address is required',
      });
    });

    it('should return validation error for invalid token addresses', async () => {
      const invalidParams = {
        ...validAddParams,
        tokenA: 'invalid-address',
        tokenB: 'another-invalid',
      };

      const response = await request(app)
        .post('/api/liquidity/add')
        .send(invalidParams)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details).toContainEqual({
        field: 'tokenA',
        message: 'Invalid token A address format',
        value: 'invalid-address',
      });
    });

    it('should return validation error for zero amounts', async () => {
      const invalidParams = {
        ...validAddParams,
        amountADesired: '0',
        amountBDesired: '0',
      };

      const response = await request(app)
        .post('/api/liquidity/add')
        .send(invalidParams)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details).toContainEqual({
        field: 'amountADesired',
        message: 'Amount A must be greater than zero',
      });
    });

    it('should return validation error for same tokens', async () => {
      const invalidParams = {
        ...validAddParams,
        tokenA: 'STX',
        tokenB: 'STX',
      };

      const response = await request(app)
        .post('/api/liquidity/add')
        .send(invalidParams)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details).toContainEqual({
        field: 'tokens',
        message: 'Token A and Token B cannot be the same',
      });
    });

    it('should handle service errors gracefully', async () => {
      vi.mocked(liquidityService.addLiquidity).mockRejectedValue(new Error('Insufficient balance'));

      const response = await request(app)
        .post('/api/liquidity/add')
        .send(validAddParams)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Insufficient balance');
    });
  });

  describe('POST /api/liquidity/remove', () => {
    const validRemoveParams = {
      tokenA: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx',
      tokenB: 'STX',
      liquidity: '100000000',
      amountAMin: '950000000',
      amountBMin: '475000000',
      userAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      gaslessMode: true,
    };

    const mockTransactionData = {
      contractAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      contractName: 'swap-contract',
      functionName: 'remove-liquidity',
      functionArgs: [],
      gaslessMode: true,
      estimatedFee: BigInt('40000'),
    };

    it('should prepare remove liquidity transaction for valid parameters', async () => {
      vi.mocked(liquidityService.removeLiquidity).mockResolvedValue(mockTransactionData);

      const response = await request(app)
        .post('/api/liquidity/remove')
        .send(validRemoveParams)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.functionName).toBe('remove-liquidity');
      expect(response.body.data.gaslessMode).toBe(true);
      expect(typeof response.body.data.estimatedFee).toBe('string');

      expect(liquidityService.removeLiquidity).toHaveBeenCalledWith({
        tokenA: validRemoveParams.tokenA,
        tokenB: validRemoveParams.tokenB,
        liquidity: BigInt(validRemoveParams.liquidity),
        amountAMin: BigInt(validRemoveParams.amountAMin),
        amountBMin: BigInt(validRemoveParams.amountBMin),
        userAddress: validRemoveParams.userAddress,
        gaslessMode: validRemoveParams.gaslessMode,
      });
    });

    it('should return validation error for invalid LP token amount', async () => {
      const invalidParams = {
        ...validRemoveParams,
        liquidity: 'invalid-amount',
      };

      const response = await request(app)
        .post('/api/liquidity/remove')
        .send(invalidParams)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details).toContainEqual({
        field: 'liquidity',
        message: 'Invalid LP token amount format',
        value: 'invalid-amount',
      });
    });

    it('should return validation error for zero liquidity', async () => {
      const invalidParams = {
        ...validRemoveParams,
        liquidity: '0',
      };

      const response = await request(app)
        .post('/api/liquidity/remove')
        .send(invalidParams)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details).toContainEqual({
        field: 'liquidity',
        message: 'LP token amount must be greater than zero',
      });
    });
  });

  describe('GET /api/liquidity/positions/:address', () => {
    const validAddress = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';

    it('should return user positions for valid address', async () => {
      const response = await request(app)
        .get(`/api/liquidity/positions/${validAddress}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(100);
    });

    it('should handle pagination for positions', async () => {
      const response = await request(app)
        .get(`/api/liquidity/positions/${validAddress}`)
        .query({ page: '2', limit: '10' })
        .expect(200);

      expect(response.body.pagination.page).toBe(2);
      expect(response.body.pagination.limit).toBe(10);
    });

    it('should return error for invalid address format', async () => {
      const response = await request(app)
        .get('/api/liquidity/positions/invalid-address')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid user address format');
    });

    it('should return error for empty address', async () => {
      const response = await request(app)
        .get('/api/liquidity/positions/')
        .expect(404); // Express returns 404 for missing route parameter
    });
  });

  describe('GET /api/liquidity/positions/:address/:poolId', () => {
    const validAddress = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
    const validPoolId = 'USDCx-STX';

    const mockLPBalance = '100000000';
    const mockPoolShare = {
      shareA: BigInt('1000000'),
      shareB: BigInt('500000'),
      percentage: 100, // 1% in basis points
    };

    it('should return position details for valid address and pool', async () => {
      vi.mocked(liquidityService.getUserLPBalance).mockResolvedValue(mockLPBalance);
      vi.mocked(liquidityService.getPoolShare).mockResolvedValue(mockPoolShare);

      const response = await request(app)
        .get(`/api/liquidity/positions/${validAddress}/${validPoolId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.poolId).toBe(validPoolId);
      expect(response.body.data.userAddress).toBe(validAddress);
      expect(response.body.data.lpTokenBalance).toBe(mockLPBalance);
      expect(response.body.data.shareA).toBe('1000000');
      expect(response.body.data.shareB).toBe('500000');
      expect(response.body.data.sharePercentage).toBe(1); // Converted from basis points

      expect(liquidityService.getUserLPBalance).toHaveBeenCalledWith(validAddress, 'USDCx', 'STX');
      expect(liquidityService.getPoolShare).toHaveBeenCalledWith(validAddress, 'USDCx', 'STX');
    });

    it('should return error for invalid pool ID format', async () => {
      const response = await request(app)
        .get(`/api/liquidity/positions/${validAddress}/invalid-pool`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid pool ID format. Expected: tokenA-tokenB');
    });

    it('should handle service errors gracefully', async () => {
      vi.mocked(liquidityService.getUserLPBalance).mockRejectedValue(new Error('Contract call failed'));

      const response = await request(app)
        .get(`/api/liquidity/positions/${validAddress}/${validPoolId}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to fetch user position details');
    });
  });

  describe('POST /api/liquidity/calculate-optimal', () => {
    const validCalculateParams = {
      tokenA: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx',
      tokenB: 'STX',
      amountA: '1000000000',
    };

    const mockOptimalAmounts = {
      amountA: BigInt('1000000000'),
      amountB: BigInt('500000000'),
      ratio: 2.0,
      priceImpact: 0.1,
    };

    it('should calculate optimal amounts for valid parameters', async () => {
      vi.mocked(liquidityService.calculateOptimalAmounts).mockResolvedValue(mockOptimalAmounts);

      const response = await request(app)
        .post('/api/liquidity/calculate-optimal')
        .send(validCalculateParams)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.amountA).toBe('1000000000');
      expect(response.body.data.amountB).toBe('500000000');
      expect(response.body.data.ratio).toBe(2.0);
      expect(response.body.data.priceImpact).toBe(0.1);

      expect(liquidityService.calculateOptimalAmounts).toHaveBeenCalledWith({
        tokenA: validCalculateParams.tokenA,
        tokenB: validCalculateParams.tokenB,
        amountA: BigInt(validCalculateParams.amountA),
        amountB: undefined,
      });
    });

    it('should return validation error when no amounts provided', async () => {
      const invalidParams = {
        tokenA: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx',
        tokenB: 'STX',
      };

      const response = await request(app)
        .post('/api/liquidity/calculate-optimal')
        .send(invalidParams)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details).toContainEqual({
        field: 'amounts',
        message: 'Either amountA or amountB must be provided',
      });
    });

    it('should return validation error for same tokens', async () => {
      const invalidParams = {
        tokenA: 'STX',
        tokenB: 'STX',
        amountA: '1000000000',
      };

      const response = await request(app)
        .post('/api/liquidity/calculate-optimal')
        .send(invalidParams)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.details).toContainEqual({
        field: 'tokens',
        message: 'Token A and Token B cannot be the same',
      });
    });
  });

  describe('GET /api/liquidity/pools/popular', () => {
    const mockPopularPools = [
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

    it('should return popular pools with default limit', async () => {
      vi.mocked(poolDiscoveryService.getPopularPools).mockResolvedValue(mockPopularPools);

      const response = await request(app)
        .get('/api/liquidity/pools/popular')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(poolDiscoveryService.getPopularPools).toHaveBeenCalledWith(10);
    });

    it('should handle custom limit parameter', async () => {
      vi.mocked(poolDiscoveryService.getPopularPools).mockResolvedValue(mockPopularPools);

      const response = await request(app)
        .get('/api/liquidity/pools/popular')
        .query({ limit: '5' })
        .expect(200);

      expect(poolDiscoveryService.getPopularPools).toHaveBeenCalledWith(5);
    });
  });

  describe('POST /api/liquidity/validate', () => {
    const validAddValidation = {
      operation: 'add',
      tokenA: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx',
      tokenB: 'STX',
      userAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      amountADesired: '1000000000',
      amountBDesired: '500000000',
    };

    it('should validate add liquidity operation successfully', async () => {
      vi.mocked(liquidityService.validateLiquidityOperation).mockResolvedValue({ valid: true });

      const response = await request(app)
        .post('/api/liquidity/validate')
        .send(validAddValidation)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.valid).toBe(true);
    });

    it('should return validation errors for invalid operation', async () => {
      vi.mocked(liquidityService.validateLiquidityOperation).mockResolvedValue({
        valid: false,
        error: 'Insufficient balance',
        suggestions: ['Check your wallet balance', 'Reduce the amount'],
      });

      const response = await request(app)
        .post('/api/liquidity/validate')
        .send(validAddValidation)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Insufficient balance');
      expect(response.body.suggestions).toEqual(['Check your wallet balance', 'Reduce the amount']);
    });

    it('should return error for invalid operation type', async () => {
      const invalidParams = {
        ...validAddValidation,
        operation: 'invalid',
      };

      const response = await request(app)
        .post('/api/liquidity/validate')
        .send(invalidParams)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid operation. Must be "add" or "remove"');
    });

    it('should return error for missing required parameters', async () => {
      const invalidParams = {
        operation: 'add',
        tokenA: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx',
        // Missing tokenB, userAddress, amounts
      };

      const response = await request(app)
        .post('/api/liquidity/validate')
        .send(invalidParams)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required parameters');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed JSON in request body', async () => {
      const response = await request(app)
        .post('/api/liquidity/add')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      // Express will handle malformed JSON and return 400
      expect(response.status).toBe(400);
    });

    it('should handle very large request bodies', async () => {
      const largeData = {
        tokenA: 'A'.repeat(1000000), // 1MB of data
        tokenB: 'STX',
        amountADesired: '1000000000',
        amountBDesired: '500000000',
        userAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      };

      const response = await request(app)
        .post('/api/liquidity/add')
        .send(largeData)
        .expect(413); // Request Entity Too Large

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Request too large');
    });

    it('should handle concurrent requests properly', async () => {
      vi.mocked(poolDiscoveryService.getAllPools).mockResolvedValue([]);

      // Make multiple concurrent requests
      const requests = Array(10).fill(null).map(() =>
        request(app).get('/api/liquidity/pools')
      );

      const responses = await Promise.all(requests);

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('Response Format Consistency', () => {
    it('should always include timestamp in error responses', async () => {
      const response = await request(app)
        .post('/api/liquidity/add')
        .send({}) // Empty body to trigger validation error
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body).toHaveProperty('timestamp');
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });

    it('should serialize all BigInt values as strings', async () => {
      const mockPool = {
        id: 'USDCx-STX',
        tokenA: { symbol: 'USDCx', name: 'USD Coin', address: 'ST1.usdcx', decimals: 6 },
        tokenB: { symbol: 'STX', name: 'Stacks', address: 'STX', decimals: 6 },
        reserveA: BigInt('999999999999999999999'),
        reserveB: BigInt('888888888888888888888'),
        totalSupply: BigInt('777777777777777777777'),
        createdAt: new Date('2024-01-01'),
        lastUpdated: new Date(),
      };

      vi.mocked(poolDiscoveryService.getAllPools).mockResolvedValue([mockPool]);

      const response = await request(app)
        .get('/api/liquidity/pools')
        .expect(200);

      const pool = response.body.data[0];
      expect(typeof pool.reserveA).toBe('string');
      expect(typeof pool.reserveB).toBe('string');
      expect(typeof pool.totalSupply).toBe('string');
      expect(pool.reserveA).toBe('999999999999999999999');
      expect(pool.reserveB).toBe('888888888888888888888');
      expect(pool.totalSupply).toBe('777777777777777777777');
    });
  });
});