/**
 * Liquidity Feature Configuration
 * Configuration settings specific to liquidity management
 */

export interface LiquidityConfig {
  // Contract settings
  swapContractAddress: string;
  swapContractName: string;

  // Pool discovery settings
  poolDiscoveryEnabled: boolean;
  poolDiscoveryInterval: number; // milliseconds
  maxPoolsPerScan: number;

  // Analytics settings
  analyticsUpdateInterval: number; // milliseconds
  historicalDataRetention: number; // days
  priceUpdateInterval: number; // milliseconds

  // Caching settings
  cacheEnabled: boolean;
  defaultCacheTTL: number; // seconds
  poolDataCacheTTL: number; // seconds
  userDataCacheTTL: number; // seconds

  // API settings
  maxPoolsPerPage: number;
  maxPositionsPerPage: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;

  // Real-time settings
  websocketEnabled: boolean;
  websocketPort: number;
  maxWebsocketConnections: number;
  heartbeatInterval: number; // milliseconds

  // Fee calculation settings
  feeCalculationEnabled: boolean;
  feeTrackingEnabled: boolean;
  taxReportingEnabled: boolean;

  // Performance settings
  backgroundProcessingEnabled: boolean;
  maxConcurrentQueries: number;
  queryTimeoutMs: number;

  // Security settings
  requireAuthentication: boolean;
  allowedOrigins: string[];
  maxRequestSize: string;

  // External services
  priceOracleEnabled: boolean;
  priceOracleUrl?: string;
  priceOracleApiKey?: string;
}

/**
 * Get liquidity configuration from environment variables
 */
export function getLiquidityConfig(): LiquidityConfig {
  return {
    // Contract settings
    swapContractAddress: process.env.STACKS_SWAP_CONTRACT_ADDRESS || 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.swap-contract',
    swapContractName: process.env.STACKS_SWAP_CONTRACT_NAME || 'swap-contract',

    // Pool discovery settings
    poolDiscoveryEnabled: process.env.POOL_DISCOVERY_ENABLED !== 'false',
    poolDiscoveryInterval: parseInt(process.env.POOL_DISCOVERY_INTERVAL || '300000'), // 5 minutes
    maxPoolsPerScan: parseInt(process.env.MAX_POOLS_PER_SCAN || '100'),

    // Analytics settings
    analyticsUpdateInterval: parseInt(process.env.ANALYTICS_UPDATE_INTERVAL || '60000'), // 1 minute
    historicalDataRetention: parseInt(process.env.HISTORICAL_DATA_RETENTION || '365'), // 1 year
    priceUpdateInterval: parseInt(process.env.PRICE_UPDATE_INTERVAL || '30000'), // 30 seconds

    // Caching settings
    cacheEnabled: process.env.CACHE_ENABLED !== 'false',
    defaultCacheTTL: parseInt(process.env.DEFAULT_CACHE_TTL || '300'), // 5 minutes
    poolDataCacheTTL: parseInt(process.env.POOL_DATA_CACHE_TTL || '30'), // 30 seconds
    userDataCacheTTL: parseInt(process.env.USER_DATA_CACHE_TTL || '60'), // 1 minute

    // API settings
    maxPoolsPerPage: parseInt(process.env.MAX_POOLS_PER_PAGE || '50'),
    maxPositionsPerPage: parseInt(process.env.MAX_POSITIONS_PER_PAGE || '100'),
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'), // 1 minute
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),

    // Real-time settings
    websocketEnabled: process.env.WEBSOCKET_ENABLED !== 'false',
    websocketPort: parseInt(process.env.WEBSOCKET_PORT || '8081'),
    maxWebsocketConnections: parseInt(process.env.MAX_WEBSOCKET_CONNECTIONS || '1000'),
    heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || '30000'), // 30 seconds

    // Fee calculation settings
    feeCalculationEnabled: process.env.FEE_CALCULATION_ENABLED !== 'false',
    feeTrackingEnabled: process.env.FEE_TRACKING_ENABLED !== 'false',
    taxReportingEnabled: process.env.TAX_REPORTING_ENABLED !== 'false',

    // Performance settings
    backgroundProcessingEnabled: process.env.BACKGROUND_PROCESSING_ENABLED !== 'false',
    maxConcurrentQueries: parseInt(process.env.MAX_CONCURRENT_QUERIES || '10'),
    queryTimeoutMs: parseInt(process.env.QUERY_TIMEOUT_MS || '30000'), // 30 seconds

    // Security settings
    requireAuthentication: process.env.REQUIRE_AUTHENTICATION === 'true',
    allowedOrigins: (process.env.ALLOWED_ORIGINS || '*').split(','),
    maxRequestSize: process.env.MAX_REQUEST_SIZE || '10mb',

    // External services
    priceOracleEnabled: process.env.PRICE_ORACLE_ENABLED === 'true',
    priceOracleUrl: process.env.PRICE_ORACLE_URL,
    priceOracleApiKey: process.env.PRICE_ORACLE_API_KEY,
  };
}

/**
 * Validate liquidity configuration
 */
export function validateLiquidityConfig(config: LiquidityConfig): string[] {
  const errors: string[] = [];

  // Validate contract settings
  if (!config.swapContractAddress) {
    errors.push('STACKS_SWAP_CONTRACT_ADDRESS is required');
  }

  if (!config.swapContractName) {
    errors.push('STACKS_SWAP_CONTRACT_NAME is required');
  }

  // Validate intervals
  if (config.poolDiscoveryInterval < 60000) {
    errors.push('POOL_DISCOVERY_INTERVAL must be at least 60000ms (1 minute)');
  }

  if (config.analyticsUpdateInterval < 30000) {
    errors.push('ANALYTICS_UPDATE_INTERVAL must be at least 30000ms (30 seconds)');
  }

  if (config.priceUpdateInterval < 10000) {
    errors.push('PRICE_UPDATE_INTERVAL must be at least 10000ms (10 seconds)');
  }

  // Validate limits
  if (config.maxPoolsPerPage > 200) {
    errors.push('MAX_POOLS_PER_PAGE cannot exceed 200');
  }

  if (config.maxPositionsPerPage > 500) {
    errors.push('MAX_POSITIONS_PER_PAGE cannot exceed 500');
  }

  if (config.maxWebsocketConnections > 10000) {
    errors.push('MAX_WEBSOCKET_CONNECTIONS cannot exceed 10000');
  }

  // Validate TTL values
  if (config.defaultCacheTTL < 10) {
    errors.push('DEFAULT_CACHE_TTL must be at least 10 seconds');
  }

  if (config.poolDataCacheTTL < 5) {
    errors.push('POOL_DATA_CACHE_TTL must be at least 5 seconds');
  }

  // Validate external service settings
  if (config.priceOracleEnabled && !config.priceOracleUrl) {
    errors.push('PRICE_ORACLE_URL is required when PRICE_ORACLE_ENABLED is true');
  }

  return errors;
}

/**
 * Default token list for liquidity pools
 */
export const DEFAULT_TOKENS = [
  {
    symbol: 'STX',
    name: 'Stacks',
    address: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM', // Sentinel principal
    decimals: 6,
    verified: true,
  },
  {
    symbol: 'USDCx',
    name: 'USDC (xReserve)',
    address: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx',
    decimals: 6,
    verified: true,
  },
  {
    symbol: 'VEX',
    name: 'VelumX Token',
    address: 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.vextoken-v1',
    decimals: 6,
    verified: true,
  },
] as const;

/**
 * Pool risk assessment criteria
 */
export const RISK_CRITERIA = {
  LOW: {
    minTVL: 100000, // $100k
    minVolume24h: 10000, // $10k
    maxPriceImpact: 0.01, // 1%
    verifiedTokens: true,
  },
  MEDIUM: {
    minTVL: 10000, // $10k
    minVolume24h: 1000, // $1k
    maxPriceImpact: 0.05, // 5%
    verifiedTokens: false,
  },
  HIGH: {
    minTVL: 0,
    minVolume24h: 0,
    maxPriceImpact: 1.0, // 100%
    verifiedTokens: false,
  },
} as const;

/**
 * Fee calculation constants
 */
export const FEE_CONSTANTS = {
  SWAP_FEE_RATE: 0.003, // 0.3%
  SWAP_FEE_NUMERATOR: 3,
  SWAP_FEE_DENOMINATOR: 1000,
  SWAP_FEE_MULTIPLIER: 997,
} as const;

/**
 * Analytics calculation constants
 */
export const ANALYTICS_CONSTANTS = {
  SECONDS_PER_DAY: 86400,
  SECONDS_PER_WEEK: 604800,
  SECONDS_PER_MONTH: 2592000,
  SECONDS_PER_YEAR: 31536000,
  BASIS_POINTS: 10000,
} as const;