/**
 * Liquidity Suggestions Service
 * Provides intelligent recommendations for optimal pool selection, risk assessment, and position rebalancing
 * Validates Requirements: 6.2, 6.3, 10.2
 */

import { getExtendedConfig } from '../config';
import { logger } from '../utils/logger';
import { getCache, CACHE_KEYS, CACHE_TTL, withCache } from '../cache/redis';
import { poolDiscoveryService } from './PoolDiscoveryService';
import { poolAnalyticsService } from './PoolAnalyticsService';
import { positionTrackingService } from './PositionTrackingService';
import { feeCalculatorService } from './FeeCalculatorService';
import { Pool, PoolAnalytics, LiquidityPosition } from '../types/liquidity';

/**
 * Risk Level Assessment
 */
export type RiskLevel = 'low' | 'medium' | 'high';

/**
 * Pool Recommendation with detailed analysis
 */
export interface PoolRecommendation {
  pool: Pool;
  analytics: PoolAnalytics;
  score: number; // 0-100 score based on multiple factors
  riskLevel: RiskLevel;
  riskFactors: string[];
  strengths: string[];
  warnings: string[];
  projectedAPR: number;
  projectedDailyEarnings: number;
  confidence: number; // 0-1 scale
  reason: string;
}

/**
 * Risk Assessment for a pool
 */
export interface RiskAssessment {
  poolId: string;
  overallRisk: RiskLevel;
  riskScore: number; // 0-100, higher = riskier
  factors: {
    liquidityRisk: { level: RiskLevel; score: number; description: string };
    volatilityRisk: { level: RiskLevel; score: number; description: string };
    impermanentLossRisk: { level: RiskLevel; score: number; description: string };
    concentrationRisk: { level: RiskLevel; score: number; description: string };
  };
  recommendations: string[];
  warnings: string[];
}

/**
 * Position Rebalancing Suggestion
 */
export interface RebalancingSuggestion {
  userAddress: string;
  currentPositions: LiquidityPosition[];
  suggestions: {
    action: 'add' | 'remove' | 'rebalance' | 'maintain';
    poolId: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
    expectedImpact: {
      riskChange: string;
      returnChange: string;
      diversificationChange: string;
    };
    details: string;
  }[];
  portfolioHealth: {
    diversification: number; // 0-100
    riskLevel: RiskLevel;
    efficiency: number; // 0-100
  };
}

/**
 * Liquidity Suggestions Service Class
 */
export class LiquiditySuggestionsService {
  private config = getExtendedConfig();
  private cache = getCache();

  constructor() {
    logger.info('LiquiditySuggestionsService initialized');
  }

  /**
   * Get optimal pool recommendations based on user preferences and risk tolerance
   * Validates Requirement 6.2: Optimal ratio calculations and price impact warnings
   */
  async getOptimalPoolRecommendations(
    userAddress: string | undefined,
    options: {
      riskTolerance?: 'conservative' | 'moderate' | 'aggressive';
      minTVL?: number;
      minAPR?: number;
      maxRisk?: RiskLevel;
      limit?: number;
    } = {}
  ): Promise<PoolRecommendation[]> {
    const cacheKey = userAddress 
      ? CACHE_KEYS.USER_RECOMMENDATIONS(userAddress)
      : 'pool:recommendations:general';
    
    return withCache(
      cacheKey,
      async () => {
        logger.debug('Calculating optimal pool recommendations', { userAddress, options });
        return this.calculatePoolRecommendations(userAddress, options);
      },
      CACHE_TTL.POOL_ANALYTICS
    );
  }

  /**
   * Calculate pool recommendations with scoring algorithm
   */
  private async calculatePoolRecommendations(
    userAddress: string | undefined,
    options: {
      riskTolerance?: 'conservative' | 'moderate' | 'aggressive';
      minTVL?: number;
      minAPR?: number;
      maxRisk?: RiskLevel;
      limit?: number;
    }
  ): Promise<PoolRecommendation[]> {
    try {
      const {
        riskTolerance = 'moderate',
        minTVL = 0,
        minAPR = 0,
        maxRisk = 'high',
        limit = 10
      } = options;

      // Get all pools and their analytics
      const pools = await poolDiscoveryService.getAllPools();
      const recommendations: PoolRecommendation[] = [];

      // Get user's current positions if address provided
      let userPositions: LiquidityPosition[] = [];
      if (userAddress) {
        userPositions = await positionTrackingService.getUserPositions(userAddress);
      }

      // Process each pool
      for (const pool of pools) {
        try {
          const analytics = await poolAnalyticsService.getPoolAnalytics(pool.id);
          
          // Apply filters
          if (analytics.tvl < minTVL) continue;
          if (analytics.apr < minAPR) continue;

          // Calculate risk assessment
          const riskAssessment = await this.assessPoolRisk(pool.id, analytics);
          
          // Apply risk filter
          if (maxRisk === 'low' && riskAssessment.overallRisk !== 'low') continue;
          if (maxRisk === 'medium' && riskAssessment.overallRisk === 'high') continue;

          // Calculate recommendation score
          const score = this.calculateRecommendationScore(
            analytics,
            riskAssessment,
            riskTolerance,
            userPositions,
            pool.id
          );

          // Generate recommendation details
          const recommendation = await this.buildRecommendation(
            pool,
            analytics,
            riskAssessment,
            score,
            userPositions
          );

          recommendations.push(recommendation);
        } catch (error) {
          logger.error('Failed to process pool for recommendations', { poolId: pool.id, error });
        }
      }

      // Sort by score (highest first)
      recommendations.sort((a, b) => b.score - a.score);

      // Return top recommendations
      return recommendations.slice(0, limit);
    } catch (error) {
      logger.error('Failed to calculate pool recommendations', { error });
      return [];
    }
  }

  /**
   * Calculate recommendation score based on multiple factors
   */
  private calculateRecommendationScore(
    analytics: PoolAnalytics,
    riskAssessment: RiskAssessment,
    riskTolerance: 'conservative' | 'moderate' | 'aggressive',
    userPositions: LiquidityPosition[],
    poolId: string
  ): number {
    let score = 0;

    // TVL Score (0-25 points) - Higher TVL = more stable
    const tvlScore = Math.min(25, (analytics.tvl / 1000000) * 5); // $1M TVL = 5 points
    score += tvlScore;

    // APR Score (0-30 points) - Higher APR = better returns
    const aprScore = Math.min(30, analytics.apr / 2); // 60% APR = 30 points
    score += aprScore;

    // Volume Score (0-20 points) - Higher volume = more fees
    const volumeScore = Math.min(20, (analytics.volume24h / 100000) * 2); // $100K volume = 2 points
    score += volumeScore;

    // Risk Score (0-25 points) - Adjust based on risk tolerance
    let riskScore = 0;
    const riskValue = riskAssessment.riskScore;
    
    if (riskTolerance === 'conservative') {
      // Prefer low risk
      riskScore = Math.max(0, 25 - (riskValue / 4));
    } else if (riskTolerance === 'moderate') {
      // Balanced approach
      riskScore = riskValue < 50 ? 25 - (riskValue / 2) : 15;
    } else {
      // Aggressive - can tolerate higher risk for higher returns
      riskScore = 15;
    }
    score += riskScore;

    // Diversification Bonus (0-10 points) - Reward pools user doesn't have
    const hasPosition = userPositions.some(pos => pos.poolId === poolId);
    if (!hasPosition) {
      score += 10;
    }

    // Liquidity Depth Bonus (0-10 points) - Deep liquidity = less slippage
    const depthScore = Math.min(10, analytics.liquidityDepth.bids.length / 2);
    score += depthScore;

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Build detailed recommendation object
   */
  private async buildRecommendation(
    pool: Pool,
    analytics: PoolAnalytics,
    riskAssessment: RiskAssessment,
    score: number,
    userPositions: LiquidityPosition[]
  ): Promise<PoolRecommendation> {
    const strengths: string[] = [];
    const warnings: string[] = [];
    const riskFactors: string[] = [];

    // Analyze strengths
    if (analytics.tvl > 1000000) {
      strengths.push(`High liquidity with $${(analytics.tvl / 1000000).toFixed(2)}M TVL`);
    }
    if (analytics.apr > 20) {
      strengths.push(`Attractive ${analytics.apr.toFixed(2)}% APR`);
    }
    if (analytics.volume24h > 100000) {
      strengths.push(`Active trading with $${(analytics.volume24h / 1000).toFixed(0)}K daily volume`);
    }
    if (riskAssessment.overallRisk === 'low') {
      strengths.push('Low risk profile with stable assets');
    }

    // Analyze warnings
    if (analytics.tvl < 100000) {
      warnings.push('Low liquidity may result in higher slippage');
    }
    if (analytics.apr > 100) {
      warnings.push('Unusually high APR may indicate elevated risk');
    }
    if (riskAssessment.overallRisk === 'high') {
      warnings.push('High risk due to volatility or low liquidity');
    }
    if (Math.abs(analytics.priceChange24h) > 10) {
      warnings.push(`High price volatility: ${analytics.priceChange24h.toFixed(2)}% in 24h`);
    }

    // Extract risk factors
    Object.entries(riskAssessment.factors).forEach(([key, factor]) => {
      if (factor.level === 'high') {
        riskFactors.push(factor.description);
      }
    });

    // Project earnings for $1000 investment
    const projection = await feeCalculatorService.projectFeeEarnings(pool.id, 1000, 'DAY_30' as any);
    
    // Generate reason
    const reason = this.generateRecommendationReason(analytics, riskAssessment, score);

    return {
      pool,
      analytics,
      score,
      riskLevel: riskAssessment.overallRisk,
      riskFactors,
      strengths,
      warnings,
      projectedAPR: analytics.apr,
      projectedDailyEarnings: projection.projectedDaily,
      confidence: projection.confidence,
      reason,
    };
  }

  /**
   * Generate human-readable recommendation reason
   */
  private generateRecommendationReason(
    analytics: PoolAnalytics,
    riskAssessment: RiskAssessment,
    score: number
  ): string {
    if (score >= 80) {
      return `Excellent opportunity with strong fundamentals: ${analytics.apr.toFixed(1)}% APR, $${(analytics.tvl / 1000000).toFixed(2)}M TVL, and ${riskAssessment.overallRisk} risk.`;
    } else if (score >= 60) {
      return `Good option with balanced risk-reward: ${analytics.apr.toFixed(1)}% APR and ${riskAssessment.overallRisk} risk profile.`;
    } else if (score >= 40) {
      return `Moderate opportunity with ${analytics.apr.toFixed(1)}% APR. Consider risk factors before investing.`;
    } else {
      return `Lower-rated pool with ${riskAssessment.overallRisk} risk. Suitable for experienced users only.`;
    }
  }

  /**
   * Assess risk for a specific pool
   * Validates Requirement 6.3: Risk assessment and warnings
   */
  async assessPoolRisk(poolId: string, analytics?: PoolAnalytics): Promise<RiskAssessment> {
    const cacheKey = CACHE_KEYS.POOL_RISK(poolId);
    
    return withCache(
      cacheKey,
      async () => {
        logger.debug('Assessing pool risk', { poolId });
        
        if (!analytics) {
          analytics = await poolAnalyticsService.getPoolAnalytics(poolId);
        }

        return this.calculateRiskAssessment(poolId, analytics);
      },
      CACHE_TTL.POOL_ANALYTICS
    );
  }

  /**
   * Calculate comprehensive risk assessment
   */
  private async calculateRiskAssessment(
    poolId: string,
    analytics: PoolAnalytics
  ): Promise<RiskAssessment> {
    // Liquidity Risk - Based on TVL
    const liquidityRisk = this.assessLiquidityRisk(analytics.tvl);
    
    // Volatility Risk - Based on price changes
    const volatilityRisk = this.assessVolatilityRisk(analytics.priceChange24h);
    
    // Impermanent Loss Risk - Based on token correlation
    const impermanentLossRisk = this.assessImpermanentLossRisk(analytics);
    
    // Concentration Risk - Based on pool dominance
    const concentrationRisk = await this.assessConcentrationRisk(poolId, analytics);

    // Calculate overall risk score (weighted average)
    const overallScore = (
      liquidityRisk.score * 0.3 +
      volatilityRisk.score * 0.3 +
      impermanentLossRisk.score * 0.25 +
      concentrationRisk.score * 0.15
    );

    // Determine overall risk level
    const overallRisk: RiskLevel = 
      overallScore < 33 ? 'low' :
      overallScore < 66 ? 'medium' : 'high';

    // Generate recommendations
    const recommendations: string[] = [];
    const warnings: string[] = [];

    if (liquidityRisk.level === 'high') {
      recommendations.push('Consider pools with higher TVL for better liquidity');
      warnings.push('Low liquidity may cause significant slippage');
    }
    if (volatilityRisk.level === 'high') {
      recommendations.push('Monitor position frequently due to high volatility');
      warnings.push('High price volatility increases impermanent loss risk');
    }
    if (impermanentLossRisk.level === 'high') {
      recommendations.push('Consider stablecoin pairs to minimize impermanent loss');
      warnings.push('Significant impermanent loss possible with uncorrelated assets');
    }
    if (concentrationRisk.level === 'high') {
      recommendations.push('Diversify across multiple pools to reduce concentration risk');
    }

    return {
      poolId,
      overallRisk,
      riskScore: overallScore,
      factors: {
        liquidityRisk,
        volatilityRisk,
        impermanentLossRisk,
        concentrationRisk,
      },
      recommendations,
      warnings,
    };
  }

  /**
   * Assess liquidity risk based on TVL
   */
  private assessLiquidityRisk(tvl: number): { level: RiskLevel; score: number; description: string } {
    if (tvl >= 1000000) {
      return {
        level: 'low',
        score: 20,
        description: 'High liquidity with minimal slippage risk',
      };
    } else if (tvl >= 100000) {
      return {
        level: 'medium',
        score: 50,
        description: 'Moderate liquidity with acceptable slippage',
      };
    } else {
      return {
        level: 'high',
        score: 80,
        description: 'Low liquidity may cause significant slippage',
      };
    }
  }

  /**
   * Assess volatility risk based on price changes
   */
  private assessVolatilityRisk(priceChange24h: number): { level: RiskLevel; score: number; description: string } {
    const absChange = Math.abs(priceChange24h);
    
    if (absChange < 5) {
      return {
        level: 'low',
        score: 20,
        description: 'Low volatility with stable price action',
      };
    } else if (absChange < 15) {
      return {
        level: 'medium',
        score: 50,
        description: 'Moderate volatility with normal price fluctuations',
      };
    } else {
      return {
        level: 'high',
        score: 80,
        description: 'High volatility increases impermanent loss risk',
      };
    }
  }

  /**
   * Assess impermanent loss risk
   */
  private assessImpermanentLossRisk(analytics: PoolAnalytics): { level: RiskLevel; score: number; description: string } {
    // Higher volatility and lower correlation = higher IL risk
    const volatility = Math.abs(analytics.priceChange24h);
    
    if (volatility < 2) {
      return {
        level: 'low',
        score: 15,
        description: 'Minimal impermanent loss risk with stable assets',
      };
    } else if (volatility < 10) {
      return {
        level: 'medium',
        score: 45,
        description: 'Moderate impermanent loss risk',
      };
    } else {
      return {
        level: 'high',
        score: 75,
        description: 'High impermanent loss risk with volatile assets',
      };
    }
  }

  /**
   * Assess concentration risk
   */
  private async assessConcentrationRisk(
    poolId: string,
    analytics: PoolAnalytics
  ): Promise<{ level: RiskLevel; score: number; description: string }> {
    try {
      // Get total TVL across all pools
      const summary = await poolAnalyticsService.getAnalyticsSummary();
      const poolPercentage = summary.totalTVL > 0 ? (analytics.tvl / summary.totalTVL) * 100 : 0;

      if (poolPercentage < 10) {
        return {
          level: 'low',
          score: 20,
          description: 'Well-diversified pool with low concentration',
        };
      } else if (poolPercentage < 30) {
        return {
          level: 'medium',
          score: 50,
          description: 'Moderate concentration in this pool',
        };
      } else {
        return {
          level: 'high',
          score: 80,
          description: 'High concentration risk - pool dominates total TVL',
        };
      }
    } catch (error) {
      logger.error('Failed to assess concentration risk', { poolId, error });
      return {
        level: 'medium',
        score: 50,
        description: 'Unable to assess concentration risk',
      };
    }
  }

  /**
   * Get position rebalancing suggestions
   * Validates Requirement 10.2: Slippage warnings and suggested parameters
   */
  async getRebalancingSuggestions(userAddress: string): Promise<RebalancingSuggestion> {
    const cacheKey = CACHE_KEYS.USER_REBALANCING(userAddress);
    
    return withCache(
      cacheKey,
      async () => {
        logger.debug('Calculating rebalancing suggestions', { userAddress });
        return this.calculateRebalancingSuggestions(userAddress);
      },
      CACHE_TTL.USER_POSITIONS
    );
  }

  /**
   * Calculate rebalancing suggestions
   */
  private async calculateRebalancingSuggestions(userAddress: string): Promise<RebalancingSuggestion> {
    try {
      const positions = await positionTrackingService.getUserPositions(userAddress);
      const portfolio = await positionTrackingService.getPortfolioSummary(userAddress);
      
      const suggestions: RebalancingSuggestion['suggestions'] = [];

      // Analyze each position
      for (const position of positions) {
        const analytics = await poolAnalyticsService.getPoolAnalytics(position.poolId);
        const riskAssessment = await this.assessPoolRisk(position.poolId, analytics);

        // Check for underperforming positions
        if (analytics.apr < 5 && position.feeEarnings < position.impermanentLoss) {
          suggestions.push({
            action: 'remove',
            poolId: position.poolId,
            reason: `Low APR (${analytics.apr.toFixed(2)}%) and fees not covering impermanent loss`,
            priority: 'high',
            expectedImpact: {
              riskChange: 'Reduced risk exposure',
              returnChange: 'Prevent further losses',
              diversificationChange: 'Reduced diversification',
            },
            details: `Current IL: $${position.impermanentLoss.toFixed(2)}, Fees: $${position.feeEarnings.toFixed(2)}`,
          });
        }

        // Check for high-risk positions
        if (riskAssessment.overallRisk === 'high' && position.currentValue > portfolio.totalValue * 0.3) {
          suggestions.push({
            action: 'rebalance',
            poolId: position.poolId,
            reason: `High risk position represents ${((position.currentValue / portfolio.totalValue) * 100).toFixed(1)}% of portfolio`,
            priority: 'medium',
            expectedImpact: {
              riskChange: 'Reduced overall portfolio risk',
              returnChange: 'More balanced returns',
              diversificationChange: 'Improved diversification',
            },
            details: `Consider reducing position size to 15-20% of portfolio`,
          });
        }

        // Check for excellent performing positions
        if (analytics.apr > 30 && riskAssessment.overallRisk === 'low') {
          suggestions.push({
            action: 'add',
            poolId: position.poolId,
            reason: `Excellent performance with ${analytics.apr.toFixed(2)}% APR and low risk`,
            priority: 'medium',
            expectedImpact: {
              riskChange: 'Minimal risk increase',
              returnChange: 'Increased returns',
              diversificationChange: 'Reduced diversification',
            },
            details: `Consider increasing position to capture higher yields`,
          });
        }
      }

      // Check for diversification opportunities
      if (positions.length < 3) {
        const recommendations = await this.getOptimalPoolRecommendations(userAddress, {
          riskTolerance: 'moderate',
          limit: 3,
        });

        for (const rec of recommendations) {
          const hasPosition = positions.some(p => p.poolId === rec.pool.id);
          if (!hasPosition) {
            suggestions.push({
              action: 'add',
              poolId: rec.pool.id,
              reason: `Diversification opportunity with ${rec.projectedAPR.toFixed(2)}% APR`,
              priority: 'low',
              expectedImpact: {
                riskChange: 'Better risk distribution',
                returnChange: 'Potential for higher returns',
                diversificationChange: 'Improved diversification',
              },
              details: rec.reason,
            });
          }
        }
      }

      // Calculate portfolio health
      const portfolioHealth = this.calculatePortfolioHealth(positions, portfolio);

      return {
        userAddress,
        currentPositions: positions,
        suggestions,
        portfolioHealth,
      };
    } catch (error) {
      logger.error('Failed to calculate rebalancing suggestions', { userAddress, error });
      return {
        userAddress,
        currentPositions: [],
        suggestions: [],
        portfolioHealth: {
          diversification: 0,
          riskLevel: 'medium',
          efficiency: 0,
        },
      };
    }
  }

  /**
   * Calculate portfolio health metrics
   */
  private calculatePortfolioHealth(
    positions: LiquidityPosition[],
    portfolio: any
  ): RebalancingSuggestion['portfolioHealth'] {
    // Diversification score (0-100)
    const diversification = Math.min(100, positions.length * 25); // 4+ positions = 100

    // Calculate average risk
    let totalRisk = 0;
    positions.forEach(() => {
      totalRisk += 50; // Simplified - would calculate actual risk per position
    });
    const avgRisk = positions.length > 0 ? totalRisk / positions.length : 50;
    const riskLevel: RiskLevel = avgRisk < 33 ? 'low' : avgRisk < 66 ? 'medium' : 'high';

    // Efficiency score based on returns vs risk
    const efficiency = portfolio.totalReturns > 0 
      ? Math.min(100, (portfolio.totalReturns / portfolio.totalValue) * 100)
      : 0;

    return {
      diversification,
      riskLevel,
      efficiency: Math.max(0, efficiency),
    };
  }

  /**
   * Clear suggestions cache
   */
  async clearSuggestionsCache(userAddress?: string): Promise<void> {
    if (userAddress) {
      await this.cache.del(CACHE_KEYS.USER_RECOMMENDATIONS(userAddress));
      await this.cache.del(CACHE_KEYS.USER_REBALANCING(userAddress));
      logger.debug('Suggestions cache cleared for user', { userAddress });
    } else {
      await this.cache.delPattern('pool:recommendations:*');
      await this.cache.delPattern('pool:risk:*');
      logger.debug('All suggestions cache cleared');
    }
  }
}

// Export singleton instance
export const liquiditySuggestionsService = new LiquiditySuggestionsService();
