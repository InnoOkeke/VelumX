/**
 * Liquidity-related TypeScript interfaces and types
 * Core data models for the liquidity swap integration feature
 */

// Core Token Interface
export interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoUrl?: string;
  priceUSD?: number;
}

// Pool Information
export interface Pool {
  id: string;
  tokenA: Token;
  tokenB: Token;
  reserveA: bigint;
  reserveB: bigint;
  totalSupply: bigint;
  createdAt: Date;
  lastUpdated: Date;
}

// Pool Reserves from Contract
export interface PoolReserves {
  reserveA: bigint;
  reserveB: bigint;
  totalSupply: bigint;
}

// Pool Share Information
export interface PoolShare {
  shareA: bigint;
  shareB: bigint;
  percentage: number; // In basis points (10000 = 100%)
}

// Liquidity Depth Analysis
export interface LiquidityDepth {
  bids: PriceLevel[];
  asks: PriceLevel[];
}

export interface PriceLevel {
  price: number;
  liquidity: number;
  priceImpact: number;
}

// Historical Data Point
export interface HistoricalDataPoint {
  timestamp: Date;
  reserveA: bigint;
  reserveB: bigint;
  totalSupply: bigint;
  tvlUSD: number;
  volume24h: number;
  priceA: number;
  priceB: number;
}

// Pool Analytics
export interface PoolAnalytics {
  poolId: string;
  tvl: number;
  volume24h: number;
  volume7d: number;
  apr: number;
  feeEarnings24h: number;
  priceChange24h: number;
  liquidityDepth: LiquidityDepth;
  historicalData: HistoricalDataPoint[];
}

// User Position Data
export interface LiquidityPosition {
  poolId: string;
  userAddress: string;
  lpTokenBalance: bigint;
  sharePercentage: number;
  tokenAAmount: bigint;
  tokenBAmount: bigint;
  currentValue: number;
  initialValue: number;
  impermanentLoss: number;
  feeEarnings: number;
  createdAt: Date;
  lastUpdated: Date;
}

// Portfolio Summary
export interface PortfolioSummary {
  userAddress: string;
  totalValue: number;
  totalFeeEarnings: number;
  totalImpermanentLoss: number;
  totalReturns: number;
  positionCount: number;
  positions: LiquidityPosition[];
}

// Position History
export interface PositionHistory {
  id: string;
  userAddress: string;
  poolId: string;
  action: 'add' | 'remove';
  lpTokenAmount: bigint;
  tokenAAmount: bigint;
  tokenBAmount: bigint;
  valueUSD: number;
  transactionHash: string;
  blockHeight: number;
  timestamp: Date;
}

// Fee Earnings
export interface FeeEarnings {
  userAddress: string;
  poolId: string;
  totalEarnings: number;
  dailyEarnings: number;
  weeklyEarnings: number;
  monthlyEarnings: number;
  annualizedReturn: number;
}

export interface FeeHistory {
  id: string;
  userAddress: string;
  poolId: string;
  amountUSD: number;
  transactionHash?: string;
  blockHeight?: number;
  timestamp: Date;
}

// Fee Projections
export interface FeeProjection {
  poolId: string;
  projectedDaily: number;
  projectedWeekly: number;
  projectedMonthly: number;
  projectedAnnual: number;
  confidence: number; // 0-1 scale
}

// Tax Report
export interface TaxReport {
  userAddress: string;
  year: number;
  totalFeeEarnings: number;
  totalTransactions: number;
  positions: {
    poolId: string;
    earnings: number;
    transactions: FeeHistory[];
  }[];
  generatedAt: Date;
}

// Transaction Data for Contract Calls
export interface TransactionData {
  contractAddress: string;
  contractName: string;
  functionName: string;
  functionArgs: any[];
  gaslessMode: boolean;
  estimatedFee: bigint;
}

// Liquidity Operation Parameters
export interface AddLiquidityParams {
  tokenA: string;
  tokenB: string;
  amountADesired: bigint;
  amountBDesired: bigint;
  amountAMin: bigint;
  amountBMin: bigint;
  userAddress: string;
  gaslessMode?: boolean;
}

export interface RemoveLiquidityParams {
  tokenA: string;
  tokenB: string;
  liquidity: bigint;
  amountAMin: bigint;
  amountBMin: bigint;
  userAddress: string;
  gaslessMode?: boolean;
}

export interface OptimalAmountParams {
  tokenA: string;
  tokenB: string;
  amountA?: bigint;
  amountB?: bigint;
}

export interface OptimalAmounts {
  amountA: bigint;
  amountB: bigint;
  ratio: number;
  priceImpact: number;
}

// Validation Results
export interface ValidationResult {
  valid: boolean;
  error?: string;
  suggestions?: string[];
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Error Response
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    suggestions?: string[];
    retryable: boolean;
  };
  timestamp: Date;
}

// Real-Time Update Types
export interface PoolUpdate {
  poolId: string;
  reserveA: bigint;
  reserveB: bigint;
  totalSupply: bigint;
  tvl: number;
  volume24h: number;
  timestamp: Date;
}

export interface PositionUpdate {
  userAddress: string;
  poolId: string;
  lpTokenBalance: bigint;
  currentValue: number;
  feeEarnings: number;
  timestamp: Date;
}

// Pool Comparison
export interface PoolComparison {
  pools: {
    poolId: string;
    tvl: number;
    apr: number;
    volume24h: number;
    feeEarnings24h: number;
    risk: 'low' | 'medium' | 'high';
  }[];
  bestByTVL: string;
  bestByAPR: string;
  bestByVolume: string;
}

// Timeframe enum
export enum Timeframe {
  HOUR_1 = '1h',
  HOUR_4 = '4h',
  HOUR_12 = '12h',
  DAY_1 = '1d',
  DAY_7 = '7d',
  DAY_30 = '30d',
  DAY_90 = '90d',
  YEAR_1 = '1y'
}

// Position Value
export interface PositionValue {
  currentValue: number;
  initialValue: number;
  unrealizedPnL: number;
  realizedPnL: number;
  totalReturn: number;
  totalReturnPercentage: number;
}

// Impermanent Loss
export interface ImpermanentLoss {
  currentLoss: number;
  currentLossPercentage: number;
  wouldHaveValue: number; // Value if held tokens separately
  actualValue: number;
  breakEvenFees: number; // Fees needed to offset IL
}

// Returns calculation
export interface Returns {
  daily: number;
  weekly: number;
  monthly: number;
  annual: number;
  totalReturn: number;
  totalReturnPercentage: number;
}

// Pool Metadata
export interface PoolMetadata {
  poolId: string;
  name: string;
  description?: string;
  tags: string[];
  verified: boolean;
  featured: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  category: string;
}