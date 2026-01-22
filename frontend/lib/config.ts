/**
 * Frontend configuration
 * Loads environment variables and provides typed config
 */

import { FrontendConfig } from './types';

/**
 * Safely get environment variable with fallback
 */
function getEnv(key: string, fallback: string): string {
  if (typeof window === 'undefined') {
    // Server-side: use process.env
    return process.env[key] || fallback;
  }
  // Client-side: use process.env (bundled at build time)
  return process.env[key] || fallback;
}

/**
 * Loads frontend configuration from environment variables
 */
export function getConfig(): FrontendConfig {
  return {
    // API endpoint
    backendUrl: getEnv('NEXT_PUBLIC_BACKEND_URL', 'https://velumx.onrender.com'),
    
    // Network configuration
    ethereumChainId: parseInt(getEnv('NEXT_PUBLIC_ETHEREUM_CHAIN_ID', '11155111')), // Sepolia
    stacksNetwork: (getEnv('NEXT_PUBLIC_STACKS_NETWORK', 'testnet') as 'testnet' | 'mainnet'),
    
    // Contract addresses (testnet defaults)
    ethereumUsdcAddress: getEnv('NEXT_PUBLIC_ETHEREUM_USDC_ADDRESS', '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'),
    ethereumTokenMessengerAddress: getEnv('NEXT_PUBLIC_ETHEREUM_TOKEN_MESSENGER_ADDRESS', '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA'),
    ethereumMessageTransmitterAddress: getEnv('NEXT_PUBLIC_ETHEREUM_MESSAGE_TRANSMITTER_ADDRESS', '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275'),
    stacksUsdcxAddress: getEnv('NEXT_PUBLIC_STACKS_USDCX_ADDRESS', 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx'),
    stacksUsdcxProtocolAddress: getEnv('NEXT_PUBLIC_STACKS_USDCX_PROTOCOL_ADDRESS', 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx-v1'),
    stacksPaymasterAddress: getEnv('NEXT_PUBLIC_STACKS_PAYMASTER_ADDRESS', 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.paymaster-v3'),
    stacksSwapContractAddress: getEnv('NEXT_PUBLIC_STACKS_SWAP_CONTRACT_ADDRESS', 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.swap-contract-v12'),
    
    // Domain IDs (Circle CCTP)
    ethereumDomainId: parseInt(getEnv('NEXT_PUBLIC_ETHEREUM_DOMAIN_ID', '0')), // Ethereum Sepolia
    stacksDomainId: parseInt(getEnv('NEXT_PUBLIC_STACKS_DOMAIN_ID', '10003')), // Stacks (custom domain)
    
    // Explorer URLs
    ethereumExplorerUrl: getEnv('NEXT_PUBLIC_ETHEREUM_EXPLORER_URL', 'https://sepolia.etherscan.io'),
    stacksExplorerUrl: getEnv('NEXT_PUBLIC_STACKS_EXPLORER_URL', 'https://explorer.hiro.so'),
  };
}

/**
 * Singleton config instance
 */
let configInstance: FrontendConfig | null = null;

/**
 * Gets the frontend configuration
 * Safe to call on both server and client
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
  {
    name: 'MessageSent',
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'message', type: 'bytes32', indexed: true },
    ],
  },
] as const;

// Circle CCTP TokenMessenger ABI
export const TOKEN_MESSENGER_ABI = [
  {
    name: 'depositForBurn',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'destinationDomain', type: 'uint32' },
      { name: 'mintRecipient', type: 'bytes32' },
      { name: 'burnToken', type: 'address' },
    ],
    outputs: [{ name: 'nonce', type: 'uint64' }],
  },
] as const;

// Circle CCTP MessageTransmitter ABI
export const MESSAGE_TRANSMITTER_ABI = [
  {
    name: 'receiveMessage',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'message', type: 'bytes' },
      { name: 'attestation', type: 'bytes' },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
  },
  {
    name: 'MessageSent',
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'message', type: 'bytes', indexed: false },
    ],
  },
] as const;
