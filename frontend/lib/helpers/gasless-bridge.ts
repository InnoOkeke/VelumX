/**
 * Gasless Bridge Helper
 * Simplified bridge operations using VelumX SDK
 */

import { getGaslessTransactionService } from '@/lib/services/GaslessTransactionService';
import { tupleCV, Cl } from '@stacks/transactions';
import { getConfig } from '@/lib/config';
import { parseUnits } from 'viem';

export interface GaslessBridgeParams {
  userAddress: string;
  amount: string;  // Amount in human-readable format (e.g., "10.5")
  recipientAddress: string;  // Ethereum address
  onProgress?: (step: string) => void;
}

/**
 * Execute gasless bridge withdrawal from Stacks to Ethereum
 * User pays gas fees in USDCx automatically
 */
export async function executeGaslessBridge(params: GaslessBridgeParams): Promise<string> {
  const { userAddress, amount, recipientAddress, onProgress } = params;
  const config = getConfig();
  const gaslessService = getGaslessTransactionService();
  
  // Convert amount to micro units (6 decimals)
  const amountInMicro = parseUnits(amount, 6);
  
  // Get fee estimate
  onProgress?.('Calculating fees...');
  const estimate = await gaslessService.estimateFee(100000);
  const feeInMicro = BigInt(estimate.maxFeeUSDCx);
  
  console.log('Bridge Details:', {
    amount: amountInMicro.toString(),
    fee: feeInMicro.toString(),
    recipient: recipientAddress
  });
  
  // Encode Ethereum address to bytes32
  const recipientBytes = encodeEthereumAddress(recipientAddress);
  
  // Build payload for paymaster withdrawal
  const payload = tupleCV({
    amount: Cl.uint(amountInMicro.toString()),
    fee: Cl.uint(feeInMicro.toString()),
    recipient: Cl.buffer(recipientBytes)
  });
  
  // Execute gasless transaction
  const result = await gaslessService.executeGaslessTransaction({
    userAddress,
    targetContract: config.stacksPaymasterAddress,
    payload,
    estimatedFeeUsdcx: (Number(feeInMicro) / 1_000_000).toString(),
    onProgress
  });
  
  return result.txid;
}

/**
 * Encode Ethereum address to bytes32 for Stacks contract
 */
function encodeEthereumAddress(address: string): Uint8Array {
  // Remove 0x prefix if present
  const hex = address.startsWith('0x') ? address.slice(2) : address;
  
  // Ethereum addresses are 20 bytes, pad to 32 bytes
  const paddedHex = hex.padStart(64, '0');
  
  // Convert to Uint8Array
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(paddedHex.substring(i * 2, i * 2 + 2), 16);
  }
  
  return bytes;
}

/**
 * Get total cost for bridge withdrawal (amount + fee)
 */
export async function getBridgeTotalCost(amount: string): Promise<{
  amount: bigint;
  fee: bigint;
  total: bigint;
  feeFormatted: string;
  totalFormatted: string;
}> {
  const gaslessService = getGaslessTransactionService();
  const amountInMicro = parseUnits(amount, 6);
  
  const estimate = await gaslessService.estimateFee(100000);
  const feeInMicro = BigInt(estimate.maxFeeUSDCx);
  const total = amountInMicro + feeInMicro;
  
  return {
    amount: amountInMicro,
    fee: feeInMicro,
    total,
    feeFormatted: (Number(feeInMicro) / 1_000_000).toFixed(6),
    totalFormatted: (Number(total) / 1_000_000).toFixed(6)
  };
}
