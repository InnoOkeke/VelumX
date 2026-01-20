/**
 * Frontend configuration
 * Loads environment variables and provides typed config
 */

import { FrontendConfig } from './types';

/**
 * Loads frontend configuration from environment variables
 */
export function getConfig(): FrontendConfig {
  return {
    // API endpoint
    backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001',
    
    // Network configuration
    ethereumChainId: parseInt(process.env.NEXT_PUBLIC_ETHEREUM_CHAIN_ID || '11155111'), // Sepolia
    stacksNetwork: (process.env.NEXT_PUBLIC_STACKS_NETWORK as 'testnet' | 'mainnet') || 'testnet',
    
    // Contract addresses (testnet defaults)
    ethereumUsdcAddress: process.env.NEXT_PUBLIC_ETHEREUM_USDC_ADDRESS || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    ethereumXReserveAddress: process.env.NEXT_PUBLIC_ETHEREUM_XRESERVE_ADDRESS || '0x008888878f94C0d87defdf0B07f46B93C1934442',
    stacksUsdcxAddress: process.env.NEXT_PUBLIC_STACKS_USDCX_ADDRESS || 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx',
    stacksUsdcxProtocolAddress: process.env.NEXT_PUBLIC_STACKS_USDCX_PROTOCOL_ADDRESS || 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx-v1',
    stacksPaymasterAddress: process.env.NEXT_PUBLIC_STACKS_PAYMASTER_ADDRESS || 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.paymaster-v3',
    
    // Domain IDs
    ethereumDomainId: parseInt(process.env.NEXT_PUBLIC_ETHEREUM_DOMAIN_ID || '0'),
    stacksDomainId: parseInt(process.env.NEXT_PUBLIC_STACKS_DOMAIN_ID || '10003'),
    
    // Explorer URLs
    ethereumExplorerUrl: process.env.NEXT_PUBLIC_ETHEREUM_EXPLORER_URL || 'https://sepolia.etherscan.io',
    stacksExplorerUrl: process.env.NEXT_PUBLIC_STACKS_EXPLORER_URL || 'https://explorer.hiro.so',
  };
}

/**
 * Singleton config instance
 */
let configInstance: FrontendConfig | null = null;

/**
 * Gets the frontend configuration
 */
export function useConfig(): FrontendConfig {
  if (!configInstance) {
    configInstance = getConfig();
  }
  return configInstance;
}

/**
 * Network names for display
 */
export const NETWORK_NAMES = {
  ethereum: 'Ethereum Sepolia',
  stacks: 'Stacks Testnet',
} as const;

/**
 * Token decimals
 */
export const TOKEN_DECIMALS = {
  usdc: 6,
  usdcx: 6,
  eth: 18,
  stx: 6,
} as const;

/**
 * Contract ABIs
 */
export const USDC_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: 'remaining', type: 'uint256' }],
  },
] as const;

export const XRESERVE_ABI = [
  {
    name: 'depositToRemote',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'value', type: 'uint256' },
      { name: 'remoteDomain', type: 'uint32' },
      { name: 'remoteRecipient', type: 'bytes32' },
      { name: 'localToken', type: 'address' },
      { name: 'maxFee', type: 'uint256' },
      { name: 'hookData', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;
