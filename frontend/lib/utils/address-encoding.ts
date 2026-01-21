/**
 * Address encoding utilities for cross-chain bridge
 * Handles conversion between Stacks addresses and bytes32 format
 * Based on official Stacks documentation: https://docs.stacks.co/more-guides/bridging-usdcx
 */

import { createAddress, addressToString, AddressVersion, StacksWireType } from '@stacks/transactions';
import { type Hex, toHex, toBytes, pad } from 'viem';

/**
 * Encodes a Stacks address to bytes32 format for xReserve protocol
 * Format: [11 zero bytes][1 version byte][20 hash160 bytes]
 * 
 * @param address - Stacks address (e.g., "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM")
 * @returns 32-byte hex string
 */
export function encodeStacksAddress(address: string): Hex {
  const stacksAddr = createAddress(address);
  const buffer = new Uint8Array(32);
  
  // 11 zero bytes (padding)
  buffer.fill(0, 0, 11);
  
  // 1 version byte
  buffer[11] = stacksAddr.version;
  
  // 20 hash160 bytes
  const hash = hexToBytes(stacksAddr.hash160);
  buffer.set(hash, 12);
  
  return toHex(buffer);
}

/**
 * Decodes a bytes32 value back to a Stacks address
 * 
 * @param bytes32 - 32-byte hex string
 * @returns Stacks address string
 */
export function decodeStacksAddress(bytes32: Hex): string {
  const buffer = toBytes(bytes32);
  
  // Skip 11 zero bytes
  // Extract version byte (position 11)
  const version = buffer[11] as AddressVersion;
  
  // Extract 20 hash160 bytes (positions 12-31)
  const hash = buffer.slice(12, 32);
  const hash160 = bytesToHex(hash);
  
  return addressToString({
    hash160,
    version,
    type: StacksWireType.Address,
  });
}

/**
 * Encodes an Ethereum address to bytes32 format
 * Left-padded with zeros using viem's pad function
 * 
 * @param address - Ethereum address (e.g., "0x1234...")
 * @returns 32-byte hex string
 */
export function encodeEthereumAddress(address: string): Hex {
  // Ensure address is lowercase and has 0x prefix
  const normalizedAddress: string = address.toLowerCase().startsWith('0x') 
    ? address.toLowerCase() 
    : `0x${address.toLowerCase()}`;
  
  // Use viem's pad function to left-pad to 32 bytes
  return pad(normalizedAddress as Hex, { size: 32 });
}

/**
 * Decodes a bytes32 value back to an Ethereum address
 * 
 * @param bytes32 - 32-byte hex string
 * @returns Ethereum address string
 */
export function decodeEthereumAddress(bytes32: Hex): Hex {
  const buffer = toBytes(bytes32);
  
  // Extract last 20 bytes (Ethereum address is 20 bytes)
  const addressBytes = buffer.slice(12, 32);
  
  return toHex(addressBytes);
}

/**
 * Validates a Stacks address format
 * 
 * @param address - Address to validate
 * @returns true if valid Stacks address
 */
export function isValidStacksAddress(address: string): boolean {
  try {
    createAddress(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates an Ethereum address format
 * 
 * @param address - Address to validate
 * @returns true if valid Ethereum address
 */
export function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// ============ Helper Functions ============

/**
 * Converts hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Converts Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
