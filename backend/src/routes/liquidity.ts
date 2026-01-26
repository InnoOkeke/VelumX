/**
 * Liquidity API Routes
 * Endpoints for liquidity management operations
 */

import { Router, Request, Response } from 'express';
import { liquidityService } from '../services/LiquidityService';
import { poolDiscoveryService } from '../services/PoolDiscoveryService';
import { positionTrackingService } from '../services/PositionTrackingService';
import { swapLiquidityIntegrationService, TransactionEventType } from '../services/SwapLiquidityIntegrationService';
import { logger } from '../utils/logger';
import {
  AddLiquidityParams,
  RemoveLiquidityParams,
  OptimalAmountParams
} from '../types/liquidity';
import {
  validateAddLiquidity,
  validateRemoveLiquidity,
  validatePoolId,
  validateUserAddress,
  validatePagination,
  validateCalculateOptimal,
  limitRequestSize,
} from '../middleware/validation';
import { createStrictRateLimiter } from '../middleware/rate-limit';

const router = Router();

// Apply request size limiting to all routes
router.use(limitRequestSize('1mb'));

// Apply strict rate limiting to transaction preparation endpoints
const strictRateLimit = createStrictRateLimiter();
router.use('/add', strictRateLimit);
router.use('/remove', strictRateLimit);

/**
 * GET /api/liquidity/pools
 * Get list of all available liquidity pools
 * 
 * Query params:
 *   - page: number (default: 1)
 *   - limit: number (default: 50)
 *   - sortBy: 'tvl' | 'volume' | 'apr' | 'created' (default: 'tvl')
 *   - sortOrder: 'asc' | 'desc' (default: 'desc')
 *   - search: string (optional)
 */
router.get('/pools', validatePagination, async (req: Request, res: Response) => {
  try {
    const {
      page = '1',
      limit = '50',
      sortBy = 'tvl',
      sortOrder = 'desc',
      search,
    } = req.query;

    logger.info('Fetching liquidity pools', {
      page,
      limit,
      sortBy,
      sortOrder,
      search,
    });

    let pools;

    if (search) {
      // Use search functionality from PoolDiscoveryService
      pools = await poolDiscoveryService.searchPools(search as string);
    } else {
      // Get all pools from PoolDiscoveryService
      pools = await poolDiscoveryService.getAllPools();
    }

    // Apply pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;

    const paginatedPools = pools.slice(startIndex, endIndex);

    // Convert bigint values to strings for JSON serialization
    const serializedPools = paginatedPools.map(pool => ({
      ...pool,
      reserveA: pool.reserveA.toString(),
      reserveB: pool.reserveB.toString(),
      totalSupply: pool.totalSupply.toString(),
      // Add mock analytics data (will be replaced with PoolAnalyticsService)
      tvl: Number(pool.totalSupply) / 1000000, // Mock TVL calculation
      volume24h: Math.floor(Math.random() * 100000), // Mock volume
      apr: Math.floor(Math.random() * 20) + 5, // Mock APR 5-25%
      verified: true,
      featured: pool.id === 'USDCx-STX',
    }));

    res.json({
      success: true,
      data: serializedPools,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: pools.length,
        hasNext: endIndex < pools.length,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch liquidity pools', { error });
    const unifiedError = swapLiquidityIntegrationService.parseError(error, 'fetch-pools');
    const errorResponse = swapLiquidityIntegrationService.formatErrorResponse(unifiedError);
    res.status(500).json(errorResponse);
  }
});

/**
 * GET /api/liquidity/pools/:poolId
 * Get detailed information about a specific pool
 */
router.get('/pools/:poolId', validatePoolId, async (req: Request, res: Response) => {
  try {
    const poolId = Array.isArray(req.params.poolId) ? req.params.poolId[0] : req.params.poolId;

    logger.info('Fetching pool details', { poolId });

    // Parse pool ID to get token symbols
    const [tokenASymbol, tokenBSymbol] = poolId.split('-');

    if (!tokenASymbol || !tokenBSymbol) {
      return res.status(400).json({
        success: false,
        error: 'Invalid pool ID format. Expected: tokenA-tokenB',
      });
    }

    // Get pool from PoolDiscoveryService
    const pools = await poolDiscoveryService.getAllPools();
    const pool = pools.find(p => p.id === poolId);

    if (!pool) {
      return res.status(404).json({
        success: false,
        error: 'Pool not found',
      });
    }

    // Get pool metadata
    const metadata = await poolDiscoveryService.getPoolMetadata(poolId);

    res.json({
      success: true,
      data: {
        ...pool,
        reserveA: pool.reserveA.toString(),
        reserveB: pool.reserveB.toString(),
        totalSupply: pool.totalSupply.toString(),
        metadata,
        // Mock analytics data (will be replaced with PoolAnalyticsService)
        tvl: Number(pool.totalSupply) / 1000000,
        volume24h: Math.floor(Math.random() * 100000),
        apr: Math.floor(Math.random() * 20) + 5,
        lastUpdated: new Date(),
      },
    });
  } catch (error) {
    logger.error('Failed to fetch pool details', { poolId: req.params.poolId, error });
    const unifiedError = swapLiquidityIntegrationService.parseError(error, 'fetch-pool-details');
    const errorResponse = swapLiquidityIntegrationService.formatErrorResponse(unifiedError);
    res.status(500).json(errorResponse);
  }
});

/**
 * POST /api/liquidity/add
 * Prepare add liquidity transaction data
 * 
 * Body: {
 *   tokenA: string,
 *   tokenB: string,
 *   amountADesired: string,
 *   amountBDesired: string,
 *   amountAMin: string,
 *   amountBMin: string,
 *   userAddress: string,
 *   gaslessMode?: boolean
 * }
 */
router.post('/add', validateAddLiquidity, async (req: Request, res: Response) => {
  try {
    const {
      tokenA,
      tokenB,
      amountADesired,
      amountBDesired,
      amountAMin,
      amountBMin,
      userAddress,
      gaslessMode = false,
    } = req.body;

    // Validation is handled by middleware, so we can proceed directly
    logger.info('Preparing add liquidity transaction', {
      tokenA,
      tokenB,
      amountADesired,
      amountBDesired,
      userAddress,
      gaslessMode,
    });

    const params: AddLiquidityParams = {
      tokenA,
      tokenB,
      amountADesired: BigInt(amountADesired),
      amountBDesired: BigInt(amountBDesired),
      amountAMin: BigInt(amountAMin || '0'),
      amountBMin: BigInt(amountBMin || '0'),
      userAddress,
      gaslessMode,
    };

    const transactionData = await liquidityService.addLiquidity(params);

    // Notify integration service about the liquidity addition (for future cache invalidation)
    // Note: This would typically be called after transaction confirmation
    // For now, we just prepare the transaction
    logger.debug('Add liquidity transaction prepared', { tokenA, tokenB, userAddress });

    res.json({
      success: true,
      data: {
        ...transactionData,
        estimatedFee: transactionData.estimatedFee.toString(),
      },
    });
  } catch (error) {
    logger.error('Failed to prepare add liquidity transaction', { error });
    const unifiedError = swapLiquidityIntegrationService.parseError(error, 'add-liquidity');
    const errorResponse = swapLiquidityIntegrationService.formatErrorResponse(unifiedError);
    res.status(500).json(errorResponse);
  }
});

/**
 * POST /api/liquidity/remove
 * Prepare remove liquidity transaction data
 * 
 * Body: {
 *   tokenA: string,
 *   tokenB: string,
 *   liquidity: string,
 *   amountAMin: string,
 *   amountBMin: string,
 *   userAddress: string,
 *   gaslessMode?: boolean
 * }
 */
router.post('/remove', validateRemoveLiquidity, async (req: Request, res: Response) => {
  try {
    const {
      tokenA,
      tokenB,
      liquidity,
      amountAMin,
      amountBMin,
      userAddress,
      gaslessMode = false,
    } = req.body;

    // Validation is handled by middleware, so we can proceed directly
    logger.info('Preparing remove liquidity transaction', {
      tokenA,
      tokenB,
      liquidity,
      userAddress,
      gaslessMode,
    });

    const params: RemoveLiquidityParams = {
      tokenA,
      tokenB,
      liquidity: BigInt(liquidity),
      amountAMin: BigInt(amountAMin || '0'),
      amountBMin: BigInt(amountBMin || '0'),
      userAddress,
      gaslessMode,
    };

    const transactionData = await liquidityService.removeLiquidity(params);

    // Notify integration service about the liquidity removal (for future cache invalidation)
    // Note: This would typically be called after transaction confirmation
    logger.debug('Remove liquidity transaction prepared', { tokenA, tokenB, userAddress });

    res.json({
      success: true,
      data: {
        ...transactionData,
        estimatedFee: transactionData.estimatedFee.toString(),
      },
    });
  } catch (error) {
    logger.error('Failed to prepare remove liquidity transaction', { error });
    const unifiedError = swapLiquidityIntegrationService.parseError(error, 'remove-liquidity');
    const errorResponse = swapLiquidityIntegrationService.formatErrorResponse(unifiedError);
    res.status(500).json(errorResponse);
  }
});

/**
 * GET /api/liquidity/positions/:address
 * Get user's liquidity positions across all pools
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
 * 
 * Query params:
 *   - page: number (default: 1)
 *   - limit: number (default: 100)
 */
router.get('/positions/:address', validateUserAddress, validatePagination, async (req: Request, res: Response) => {
  try {
    const address = Array.isArray(req.params.address) ? req.params.address[0] : req.params.address;
    const addressStr = Array.isArray(address) ? address[0] : address;
    const { page = '1', limit = '100' } = req.query;

    logger.info('Fetching user liquidity positions', { address: addressStr, page, limit });

    // Fetch positions using PositionTrackingService
    // Validates: Requirement 4.1 - Fetch all LP token balances across pools
    const positions = await positionTrackingService.getUserPositions(addressStr);

    // Apply pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedPositions = positions.slice(startIndex, endIndex);

    // Convert bigint values to strings for JSON serialization
    const serializedPositions = paginatedPositions.map(pos => ({
      poolId: pos.poolId,
      userAddress: pos.userAddress,
      lpTokenBalance: pos.lpTokenBalance.toString(),
      sharePercentage: pos.sharePercentage,
      tokenAAmount: pos.tokenAAmount.toString(),
      tokenBAmount: pos.tokenBAmount.toString(),
      currentValue: pos.currentValue,
      initialValue: pos.initialValue,
      impermanentLoss: pos.impermanentLoss,
      feeEarnings: pos.feeEarnings,
      createdAt: pos.createdAt,
      lastUpdated: pos.lastUpdated,
    }));

    res.json({
      success: true,
      data: serializedPositions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: positions.length,
        hasNext: endIndex < positions.length,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch user positions', { address: req.params.address, error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user positions',
    });
  }
});

/**
 * GET /api/liquidity/positions/:address/:poolId
 * Get detailed information about a user's position in a specific pool
 */
router.get('/positions/:address/:poolId', validateUserAddress, validatePoolId, async (req: Request, res: Response) => {
  try {
    const address = Array.isArray(req.params.address) ? req.params.address[0] : req.params.address;
    const poolId = Array.isArray(req.params.poolId) ? req.params.poolId[0] : req.params.poolId;

    logger.info('Fetching user position details', { address, poolId });

    // Parse pool ID to get token addresses
    const [tokenA, tokenB] = poolId.split('-');

    if (!tokenA || !tokenB) {
      return res.status(400).json({
        success: false,
        error: 'Invalid pool ID format. Expected: tokenA-tokenB',
      });
    }

    // Get user's LP balance and pool share
    const [lpBalance, poolShare] = await Promise.all([
      liquidityService.getUserLPBalance(address, tokenA, tokenB),
      liquidityService.getPoolShare(address, tokenA, tokenB),
    ]);

    res.json({
      success: true,
      data: {
        poolId,
        userAddress: address,
        lpTokenBalance: lpBalance,
        shareA: poolShare.shareA.toString(),
        shareB: poolShare.shareB.toString(),
        sharePercentage: poolShare.percentage / 100, // Convert basis points to percentage
        lastUpdated: new Date(),
      },
    });
  } catch (error) {
    logger.error('Failed to fetch user position details', {
      address: req.params.address,
      poolId: req.params.poolId,
      error
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user position details',
    });
  }
});

/**
 * GET /api/liquidity/analytics/:poolId
 * Get analytics data for a specific pool
 * Fixes 404 error in frontend
 */
router.get('/analytics/:poolId', validatePoolId, async (req: Request, res: Response) => {
  try {
    const poolId = Array.isArray(req.params.poolId) ? req.params.poolId[0] : req.params.poolId;
    const { timeframe = '24h' } = req.query;

    logger.info('Fetching pool analytics', { poolId, timeframe });

    // Mock analytics data
    // In a real implementation, this would come from an indexing service or database
    const mockAnalytics = {
      poolId,
      tvl: 1250000 + Math.random() * 50000,
      volume24h: 45000 + Math.random() * 5000,
      fees24h: 135 + Math.random() * 15,
      apr: 12.5 + Math.random() * 2,
      priceHistory: Array.from({ length: 24 }, (_, i) => ({
        timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
        price: 1.0 + (Math.random() * 0.1 - 0.05),
      })),
      volumeHistory: Array.from({ length: 7 }, (_, i) => ({
        timestamp: new Date(Date.now() - (6 - i) * 86400000).toISOString(),
        volume: 40000 + Math.random() * 10000,
      })),
    };

    res.json({
      success: true,
      data: mockAnalytics,
    });
  } catch (error) {
    logger.error('Failed to fetch pool analytics', { poolId: req.params.poolId, error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pool analytics',
    });
  }
});

/**
 * GET /api/liquidity/positions/:address/history
 * Get transaction history for user's liquidity positions
 * Validates: Requirement 4.5 - Provide transaction history with timestamps and amounts
 */
router.get('/positions/:address/history', validateUserAddress, async (req: Request, res: Response) => {
  try {
    const address = Array.isArray(req.params.address) ? req.params.address[0] : req.params.address;
    const addressStr = Array.isArray(address) ? address[0] : address;

    logger.info('Fetching user position history', { address: addressStr });

    // Fetch position history using PositionTrackingService
    const history = await positionTrackingService.getPositionHistory(addressStr);

    // Convert bigint values to strings for JSON serialization
    const serializedHistory = history.map(tx => ({
      id: tx.id,
      userAddress: tx.userAddress,
      poolId: tx.poolId,
      action: tx.action,
      lpTokenAmount: tx.lpTokenAmount.toString(),
      tokenAAmount: tx.tokenAAmount.toString(),
      tokenBAmount: tx.tokenBAmount.toString(),
      valueUSD: tx.valueUSD,
      transactionHash: tx.transactionHash,
      blockHeight: tx.blockHeight,
      timestamp: tx.timestamp,
    }));

    res.json({
      success: true,
      data: serializedHistory,
    });
  } catch (error) {
    logger.error('Failed to fetch user position history', { address: req.params.address, error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user position history',
    });
  }
});

/**
 * GET /api/liquidity/pools/popular
 * Get popular pools sorted by TVL
 * 
 * Query params:
 *   - limit: number (default: 10)
 */
router.get('/pools/popular', async (req: Request, res: Response) => {
  try {
    const { limit = '10' } = req.query;
    const limitNum = parseInt(limit as string);

    logger.info('Fetching popular pools', { limit: limitNum });

    const popularPools = await poolDiscoveryService.getPopularPools(limitNum);

    // Convert bigint values to strings for JSON serialization
    const serializedPools = popularPools.map(pool => ({
      ...pool,
      reserveA: pool.reserveA.toString(),
      reserveB: pool.reserveB.toString(),
      totalSupply: pool.totalSupply.toString(),
      tvl: Number(pool.totalSupply) / 1000000, // Mock TVL calculation
      volume24h: Math.floor(Math.random() * 100000), // Mock volume
      apr: Math.floor(Math.random() * 20) + 5, // Mock APR 5-25%
    }));

    res.json({
      success: true,
      data: serializedPools,
    });
  } catch (error) {
    logger.error('Failed to fetch popular pools', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch popular pools',
    });
  }
});

/**
 * GET /api/liquidity/pools/featured
 * Get featured pools
 */
router.get('/pools/featured', async (req: Request, res: Response) => {
  try {
    logger.info('Fetching featured pools');

    const featuredPools = await poolDiscoveryService.getFeaturedPools();

    // Convert bigint values to strings for JSON serialization
    const serializedPools = featuredPools.map(pool => ({
      ...pool,
      reserveA: pool.reserveA.toString(),
      reserveB: pool.reserveB.toString(),
      totalSupply: pool.totalSupply.toString(),
      tvl: Number(pool.totalSupply) / 1000000, // Mock TVL calculation
      volume24h: Math.floor(Math.random() * 100000), // Mock volume
      apr: Math.floor(Math.random() * 20) + 5, // Mock APR 5-25%
    }));

    res.json({
      success: true,
      data: serializedPools,
    });
  } catch (error) {
    logger.error('Failed to fetch featured pools', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch featured pools',
    });
  }
});

/**
 * GET /api/liquidity/pools/stats
 * Get pool statistics summary
 */
router.get('/pools/stats', async (req: Request, res: Response) => {
  try {
    logger.info('Fetching pool statistics summary');

    const stats = await poolDiscoveryService.getPoolStatsSummary();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Failed to fetch pool statistics', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pool statistics',
    });
  }
});

/**
 * POST /api/liquidity/pools/refresh
 * Manually trigger pool discovery and refresh cache
 */
router.post('/pools/refresh', async (req: Request, res: Response) => {
  try {
    const { poolId } = req.body;

    logger.info('Refreshing pool data', { poolId });

    await poolDiscoveryService.refreshPoolData(poolId);

    res.json({
      success: true,
      message: poolId ? `Pool ${poolId} data refreshed` : 'All pool data refreshed',
    });
  } catch (error) {
    logger.error('Failed to refresh pool data', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to refresh pool data',
    });
  }
});

/**
 * GET /api/liquidity/discovery/status
 * Get pool discovery service status
 */
router.get('/discovery/status', async (req: Request, res: Response) => {
  try {
    logger.info('Fetching discovery status');

    const status = poolDiscoveryService.getDiscoveryStatus();

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('Failed to fetch discovery status', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch discovery status',
    });
  }
});

/**
 * POST /api/liquidity/discovery/index
 * Manually trigger pool indexing
 */
router.post('/discovery/index', async (req: Request, res: Response) => {
  try {
    logger.info('Manually triggering pool indexing');

    await poolDiscoveryService.indexNewPools();

    res.json({
      success: true,
      message: 'Pool indexing triggered successfully',
    });
  } catch (error) {
    logger.error('Failed to trigger pool indexing', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to trigger pool indexing',
    });
  }
});

/**
 * POST /api/liquidity/calculate-optimal
 * Calculate optimal amounts for adding liquidity
 * 
 * Body: {
 *   tokenA: string,
 *   tokenB: string,
 *   amountA?: string,
 *   amountB?: string
 * }
 */
router.post('/calculate-optimal', validateCalculateOptimal, async (req: Request, res: Response) => {
  try {
    const { tokenA, tokenB, amountA, amountB } = req.body;

    // Validation is handled by middleware, so we can proceed directly
    logger.info('Calculating optimal liquidity amounts', { tokenA, tokenB, amountA, amountB });

    const params: OptimalAmountParams = {
      tokenA,
      tokenB,
      amountA: amountA ? BigInt(amountA) : undefined,
      amountB: amountB ? BigInt(amountB) : undefined,
    };

    const optimalAmounts = await liquidityService.calculateOptimalAmounts(params);

    res.json({
      success: true,
      data: {
        amountA: optimalAmounts.amountA.toString(),
        amountB: optimalAmounts.amountB.toString(),
        ratio: optimalAmounts.ratio,
        priceImpact: optimalAmounts.priceImpact,
      },
    });
  } catch (error) {
    logger.error('Failed to calculate optimal amounts', { error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate optimal amounts',
    });
  }
});

/**
 * POST /api/liquidity/calculate-remove
 * Calculate expected amounts when removing liquidity
 * 
 * Body: {
 *   tokenA: string,
 *   tokenB: string,
 *   lpTokenAmount: string,
 *   userAddress: string
 * }
 */
router.post('/calculate-remove', async (req: Request, res: Response) => {
  try {
    const { tokenA, tokenB, lpTokenAmount, userAddress } = req.body;

    // Validation
    if (!tokenA || !tokenB || !lpTokenAmount || !userAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: tokenA, tokenB, lpTokenAmount, userAddress',
      });
    }

    logger.info('Calculating remove liquidity amounts', { tokenA, tokenB, lpTokenAmount, userAddress });

    const amounts = await liquidityService.calculateRemoveAmounts(
      userAddress,
      tokenA,
      tokenB,
      BigInt(lpTokenAmount)
    );

    res.json({
      success: true,
      data: {
        amountA: amounts.amountA.toString(),
        amountB: amounts.amountB.toString(),
      },
    });
  } catch (error) {
    logger.error('Failed to calculate remove amounts', { error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate remove amounts',
    });
  }
});

/**
 * POST /api/liquidity/validate
 * Validate liquidity operation parameters
 * 
 * Body: {
 *   operation: 'add' | 'remove',
 *   tokenA: string,
 *   tokenB: string,
 *   userAddress: string,
 *   // For add liquidity:
 *   amountADesired?: string,
 *   amountBDesired?: string,
 *   // For remove liquidity:
 *   liquidity?: string
 * }
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { operation, tokenA, tokenB, userAddress } = req.body;

    // Validation
    if (!operation || !tokenA || !tokenB || !userAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: operation, tokenA, tokenB, userAddress',
      });
    }

    logger.info('Validating liquidity operation', { operation, tokenA, tokenB, userAddress });

    let validation;

    if (operation === 'add') {
      const { amountADesired, amountBDesired } = req.body;

      if (!amountADesired || !amountBDesired) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters for add liquidity: amountADesired, amountBDesired',
        });
      }

      const params: AddLiquidityParams = {
        tokenA,
        tokenB,
        amountADesired: BigInt(amountADesired),
        amountBDesired: BigInt(amountBDesired),
        amountAMin: BigInt(0),
        amountBMin: BigInt(0),
        userAddress,
      };

      validation = await liquidityService.validateLiquidityOperation(params);
    } else if (operation === 'remove') {
      const { liquidity } = req.body;

      if (!liquidity) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameter for remove liquidity: liquidity',
        });
      }

      const params: RemoveLiquidityParams = {
        tokenA,
        tokenB,
        liquidity: BigInt(liquidity),
        amountAMin: BigInt(0),
        amountBMin: BigInt(0),
        userAddress,
      };

      validation = await liquidityService.validateRemoveLiquidity(params);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid operation. Must be "add" or "remove"',
      });
    }

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
        suggestions: validation.suggestions,
      });
    }

    res.json({
      success: true,
      data: { valid: true },
    });
  } catch (error) {
    logger.error('Failed to validate liquidity operation', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to validate liquidity operation',
    });
  }
});

/**
 * GET /api/liquidity/recommendations/:userAddress
 * Get intelligent pool recommendations for a user
 * Validates Requirements: 6.2, 6.3
 */
router.get('/recommendations/:userAddress', validateUserAddress, async (req: Request, res: Response) => {
  try {
    const userAddress = Array.isArray(req.params.userAddress) ? req.params.userAddress[0] : req.params.userAddress;
    const {
      riskTolerance = 'moderate',
      minTVL,
      minAPR,
      maxRisk = 'high',
      limit = '10',
    } = req.query;

    logger.info('Fetching pool recommendations', { userAddress, riskTolerance });

    const { liquiditySuggestionsService } = await import('../services/LiquiditySuggestionsService');

    const recommendations = await liquiditySuggestionsService.getOptimalPoolRecommendations(
      userAddress,
      {
        riskTolerance: riskTolerance as any,
        minTVL: minTVL ? parseFloat(minTVL as string) : undefined,
        minAPR: minAPR ? parseFloat(minAPR as string) : undefined,
        maxRisk: maxRisk as any,
        limit: parseInt(limit as string),
      }
    );

    // Serialize bigint values
    const serialized = recommendations.map(rec => ({
      ...rec,
      pool: {
        ...rec.pool,
        reserveA: rec.pool.reserveA.toString(),
        reserveB: rec.pool.reserveB.toString(),
        totalSupply: rec.pool.totalSupply.toString(),
      },
    }));

    res.json({
      success: true,
      data: serialized,
    });
  } catch (error) {
    logger.error('Failed to fetch pool recommendations', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pool recommendations',
    });
  }
});

/**
 * GET /api/liquidity/risk/:poolId
 * Get risk assessment for a specific pool
 * Validates Requirement: 6.3
 */
router.get('/risk/:poolId', validatePoolId, async (req: Request, res: Response) => {
  try {
    const poolId = Array.isArray(req.params.poolId) ? req.params.poolId[0] : req.params.poolId;

    logger.info('Fetching pool risk assessment', { poolId });

    const { liquiditySuggestionsService } = await import('../services/LiquiditySuggestionsService');

    const riskAssessment = await liquiditySuggestionsService.assessPoolRisk(poolId);

    res.json({
      success: true,
      data: riskAssessment,
    });
  } catch (error) {
    logger.error('Failed to fetch pool risk assessment', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pool risk assessment',
    });
  }
});

/**
 * GET /api/liquidity/rebalancing/:userAddress
 * Get position rebalancing suggestions for a user
 * Validates Requirement: 10.2
 */
router.get('/rebalancing/:userAddress', validateUserAddress, async (req: Request, res: Response) => {
  try {
    const userAddress = Array.isArray(req.params.userAddress) ? req.params.userAddress[0] : req.params.userAddress;

    logger.info('Fetching rebalancing suggestions', { userAddress });

    const { liquiditySuggestionsService } = await import('../services/LiquiditySuggestionsService');

    const suggestions = await liquiditySuggestionsService.getRebalancingSuggestions(userAddress);

    // Serialize bigint values
    const serialized = {
      ...suggestions,
      currentPositions: suggestions.currentPositions.map(pos => ({
        ...pos,
        lpTokenBalance: pos.lpTokenBalance.toString(),
        tokenAAmount: pos.tokenAAmount.toString(),
        tokenBAmount: pos.tokenBAmount.toString(),
      })),
    };

    res.json({
      success: true,
      data: serialized,
    });
  } catch (error) {
    logger.error('Failed to fetch rebalancing suggestions', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rebalancing suggestions',
    });
  }
});

/**
 * GET /api/liquidity/fees/history/:userAddress
 * Get fee earnings history for a user
 * Validates Requirement: 7.2
 */
router.get('/fees/history/:userAddress', validateUserAddress, async (req: Request, res: Response) => {
  try {
    const userAddress = Array.isArray(req.params.userAddress) ? req.params.userAddress[0] : req.params.userAddress;
    const { timeframe = '30d' } = req.query;

    logger.info('Fetching fee history', { userAddress, timeframe });

    const { feeCalculatorService } = await import('../services/FeeCalculatorService');

    const history = await feeCalculatorService.getFeeHistory(userAddress, timeframe as any);

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    logger.error('Failed to fetch fee history', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch fee history',
    });
  }
});

/**
 * GET /api/liquidity/fees/projection/:poolId
 * Get fee earnings projection for a pool
 * Validates Requirement: 7.3
 */
router.get('/fees/projection/:poolId', validatePoolId, async (req: Request, res: Response) => {
  try {
    const poolId = Array.isArray(req.params.poolId) ? req.params.poolId[0] : req.params.poolId;
    const { amount = '1000', timeframe = '30d' } = req.query;

    logger.info('Fetching fee projection', { poolId, amount, timeframe });

    const { feeCalculatorService } = await import('../services/FeeCalculatorService');

    const projection = await feeCalculatorService.projectFeeEarnings(
      poolId,
      parseFloat(amount as string),
      timeframe as any
    );

    res.json({
      success: true,
      data: projection,
    });
  } catch (error) {
    logger.error('Failed to fetch fee projection', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch fee projection',
    });
  }
});

/**
 * GET /api/liquidity/fees/tax-report/:userAddress
 * Generate tax report for fee earnings
 * Validates Requirement: 7.5
 */
router.get('/fees/tax-report/:userAddress', validateUserAddress, async (req: Request, res: Response) => {
  try {
    const userAddress = Array.isArray(req.params.userAddress) ? req.params.userAddress[0] : req.params.userAddress;
    const { year = new Date().getFullYear().toString() } = req.query;

    logger.info('Generating tax report', { userAddress, year });

    const { feeCalculatorService } = await import('../services/FeeCalculatorService');

    const taxReport = await feeCalculatorService.generateFeeReport(
      userAddress,
      parseInt(year as string)
    );

    res.json({
      success: true,
      data: taxReport,
    });
  } catch (error) {
    logger.error('Failed to generate tax report', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to generate tax report',
    });
  }
});

/**
 * POST /api/liquidity/transaction-confirmed
 * Notify the system that a transaction has been confirmed
 * This triggers cache invalidation and data consistency updates
 * 
 * Body: {
 *   type: 'SWAP_EXECUTED' | 'LIQUIDITY_ADDED' | 'LIQUIDITY_REMOVED',
 *   poolId: string,
 *   userAddress: string,
 *   tokenA: string,
 *   tokenB: string,
 *   txHash: string
 * }
 */
router.post('/transaction-confirmed', async (req: Request, res: Response) => {
  try {
    const { type, poolId, userAddress, tokenA, tokenB, txHash } = req.body;

    // Validation
    if (!type || !poolId || !userAddress || !tokenA || !tokenB) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: type, poolId, userAddress, tokenA, tokenB',
      });
    }

    logger.info('Processing transaction confirmation', { type, poolId, userAddress, txHash });

    // Handle the transaction event
    await swapLiquidityIntegrationService.handleTransactionEvent({
      type: type as TransactionEventType,
      poolId,
      userAddress,
      tokenA,
      tokenB,
      timestamp: new Date(),
      txHash,
    });

    res.json({
      success: true,
      message: 'Transaction processed and caches updated',
    });
  } catch (error) {
    logger.error('Failed to process transaction confirmation', { error });
    const unifiedError = swapLiquidityIntegrationService.parseError(error, 'transaction-confirmed');
    const errorResponse = swapLiquidityIntegrationService.formatErrorResponse(unifiedError);
    res.status(500).json(errorResponse);
  }
});

/**
 * GET /api/liquidity/system-health
 * Get system health status for swap-liquidity integration
 */
router.get('/system-health', async (req: Request, res: Response) => {
  try {
    logger.info('Checking system health');

    const health = await swapLiquidityIntegrationService.getSystemHealth();

    res.json({
      success: true,
      data: health,
    });
  } catch (error) {
    logger.error('Failed to check system health', { error });
    const unifiedError = swapLiquidityIntegrationService.parseError(error, 'system-health');
    const errorResponse = swapLiquidityIntegrationService.formatErrorResponse(unifiedError);
    res.status(500).json(errorResponse);
  }
});

/**
 * POST /api/liquidity/token-selection
 * Save user's token selection for consistency across interfaces
 * 
 * Body: {
 *   userAddress: string,
 *   tokenA: string,
 *   tokenB: string,
 *   source: 'swap' | 'liquidity'
 * }
 */
router.post('/token-selection', async (req: Request, res: Response) => {
  try {
    const { userAddress, tokenA, tokenB, source } = req.body;

    // Validation
    if (!userAddress || !tokenA || !tokenB || !source) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: userAddress, tokenA, tokenB, source',
      });
    }

    logger.info('Saving token selection', { userAddress, tokenA, tokenB, source });

    await swapLiquidityIntegrationService.setTokenSelection(
      userAddress,
      tokenA,
      tokenB,
      source as 'swap' | 'liquidity'
    );

    res.json({
      success: true,
      message: 'Token selection saved',
    });
  } catch (error) {
    logger.error('Failed to save token selection', { error });
    const unifiedError = swapLiquidityIntegrationService.parseError(error, 'token-selection');
    const errorResponse = swapLiquidityIntegrationService.formatErrorResponse(unifiedError);
    res.status(500).json(errorResponse);
  }
});

/**
 * GET /api/liquidity/token-selection/:userAddress
 * Get user's last token selection
 */
router.get('/token-selection/:userAddress', validateUserAddress, async (req: Request, res: Response) => {
  try {
    const userAddress = Array.isArray(req.params.userAddress) ? req.params.userAddress[0] : req.params.userAddress;

    logger.info('Fetching token selection', { userAddress });

    const selection = await swapLiquidityIntegrationService.getTokenSelection(userAddress);

    if (!selection) {
      return res.json({
        success: true,
        data: null,
      });
    }

    res.json({
      success: true,
      data: selection,
    });
  } catch (error) {
    logger.error('Failed to fetch token selection', { error });
    const unifiedError = swapLiquidityIntegrationService.parseError(error, 'get-token-selection');
    const errorResponse = swapLiquidityIntegrationService.formatErrorResponse(unifiedError);
    res.status(500).json(errorResponse);
  }
});

export default router;