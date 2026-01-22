/**
 * Backend configuration management
 * Validates and loads environment variables
 */

import dotenv from 'dotenv';
import { BackendConfig } from '@shared/types';
import { getLiquidityConfig, validateLiquidityConfig, LiquidityConfig } from './liquidity';

dotenv.config();

/**
 * Extended backend configuration with liquidity features
 */
export interface ExtendedBackendConfig extends BackendConfig {
  liquidity: LiquidityConfig;
}
/**
 * Required environment variables
 */
const REQUIRED_ENV_VARS = [
  'ETHEREUM_RPC_URL',
  'STACKS_RPC_URL',
  'RELAYER_PRIVATE_KEY',
  'RELAYER_STACKS_ADDRESS',
] as const;

/**
 * Loads and validates backend configuration with liquidity features
 */
export function loadExtendedConfig(): ExtendedBackendConfig {
  // Load base config
  const baseConfig = loadConfig();
  
  // Load liquidity config
  const liquidityConfig = getLiquidityConfig();
  
  // Validate liquidity config
  const liquidityErrors = validateLiquidityConfig(liquidityConfig);
  if (liquidityErrors.length > 0) {
    throw new Error(
      `Invalid liquidity configuration:\n${liquidityErrors.map(e => `  - ${e}`).join('\n')}`
    );
  }
  
  return {
    ...baseConfig,
    liquidity: liquidityConfig,
  };
}

/**
 * Validates that all required environment variables are present
 * Throws error if any are missing
 */
function validateEnvironment(): void {
  const missing: string[] = [];
  
  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map(v => `  - ${v}`).join('\n')}\n\n` +
      `Please check your .env file and ensure all required variables are set.`
    );
  }
}

/**
 * Parses a bigint from environment variable
 */
function parseBigInt(value: string | undefined, defaultValue: bigint): bigint {
  if (!value) return defaultValue;
  try {
    return BigInt(value);
  } catch {
    return defaultValue;
  }
}

/**
 * Parses a number from environment variable
 */
function parseNumber(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Loads and validates backend configuration
 */
export function loadConfig(): BackendConfig {
  // Validate required variables first
  validateEnvironment();
  
  const config: BackendConfig = {
    // Network configuration
    ethereumRpcUrl: process.env.ETHEREUM_RPC_URL!,
    stacksRpcUrl: process.env.STACKS_RPC_URL || 'https://api.testnet.hiro.so',
    
    // Contract addresses (testnet defaults)
    ethereumUsdcAddress: process.env.ETHEREUM_USDC_ADDRESS || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    ethereumXReserveAddress: process.env.ETHEREUM_XRESERVE_ADDRESS || '0x008888878f94C0d87defdf0B07f46B93C1934442',
    stacksUsdcxAddress: process.env.STACKS_USDCX_ADDRESS || 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx',
    stacksUsdcxProtocolAddress: process.env.STACKS_USDCX_PROTOCOL_ADDRESS || 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx-v1',
    stacksPaymasterAddress: process.env.STACKS_PAYMASTER_ADDRESS || '',
    stacksSwapContractAddress: process.env.STACKS_SWAP_CONTRACT_ADDRESS || 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.swap-contract-v12',
    
    // API keys
    circleApiKey: process.env.CIRCLE_API_KEY,
    
    // Relayer configuration
    relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY!,
    relayerStacksAddress: process.env.RELAYER_STACKS_ADDRESS!,
    minStxBalance: parseBigInt(process.env.MIN_STX_BALANCE, BigInt(1_000_000)), // 1 STX default
    
    // Monitoring configuration
    attestationPollInterval: parseNumber(process.env.ATTESTATION_POLL_INTERVAL, 30000), // 30 seconds
    maxRetries: parseNumber(process.env.MAX_RETRIES, 3),
    transactionTimeout: parseNumber(process.env.TRANSACTION_TIMEOUT, 3600000), // 1 hour
    
    // Fee configuration
    paymasterMarkup: parseNumber(process.env.PAYMASTER_MARKUP, 5), // 5% default
    
    // Rate limiting
    maxRequestsPerMinute: parseNumber(process.env.MAX_REQUESTS_PER_MINUTE, 100),
    
    // Server configuration
    port: parseNumber(process.env.PORT, 3001),
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  };
  
  return config;
}

/**
 * Singleton config instances
 */
let configInstance: BackendConfig | null = null;
let extendedConfigInstance: ExtendedBackendConfig | null = null;

/**
 * Gets the backend configuration
 * Loads and validates on first call
 */
export function getConfig(): BackendConfig {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

/**
 * Gets the extended backend configuration with liquidity features
 * Loads and validates on first call
 */
export function getExtendedConfig(): ExtendedBackendConfig {
  if (!extendedConfigInstance) {
    extendedConfigInstance = loadExtendedConfig();
  }
  return extendedConfigInstance;
}

/**
 * Resets the config instances (useful for testing)
 */
export function resetConfig(): void {
  configInstance = null;
  extendedConfigInstance = null;
}
