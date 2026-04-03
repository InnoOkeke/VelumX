/**
 * Simple Gasless Bridge Helper
 * Uses Stacks-native sponsored transactions with simple-paymaster-v1
 * 
 * MULTI-TOKEN SUPPORT:
 * The paymaster accepts ANY SIP-010 token for fees via the <sip-010-trait> parameter.
 * To use a different token (e.g., sBTC, ALEX):
 * 1. Convert the fee estimate to the desired token's units
 * 2. Pass the token's contract address as the last parameter
 * 
 * Example with sBTC:
 *   Cl.principal('SM3KNVZS30WM7F89SXKVVFY4SN9RMPZZ9FX929N0V.sbtc')
 * 
 * Example with ALEX:
 *   Cl.principal('ALEX_TOKEN_ADDRESS')
 */

import { getStacksConnect, getNetworkInstance } from '../stacks-loader';
import { Cl } from '@stacks/transactions';
import { getConfig } from '../config';
import { parseUnits } from 'viem';
import { getVelumXClient } from '../velumx';

export interface SimpleGaslessBridgeParams {
  userAddress: string;
  amount: string;  // Amount in human-readable format (e.g., "10.5")
  recipientAddress: string;  // Ethereum address
  onProgress?: (step: string) => void;
}

/**
 * Execute gasless bridge withdrawal using simple-paymaster
 * User pays gas fees in USDCx, relayer sponsors STX
 */
export async function executeSimpleGaslessBridge(params: SimpleGaslessBridgeParams): Promise<string> {
  const { userAddress, amount, recipientAddress, onProgress } = params;
  const config = getConfig();
  const velumx = getVelumXClient();
  
  // Convert amount to micro units (6 decimals)
  const amountInMicro = parseUnits(amount, 6);
  
  // Get fee estimate
  onProgress?.('Calculating fees...');
  const estimate = await velumx.estimateFee({ estimatedGas: 100000 });
  const feeInMicro = BigInt(estimate.maxFeeUSDCx);
  
  console.log('Simple Bridge Details:', {
    amount: amountInMicro.toString(),
    fee: feeInMicro.toString(),
    recipient: recipientAddress
  });
  
  // Encode Ethereum address to bytes32
  const recipientBytes = encodeEthereumAddress(recipientAddress);
  
  // Get relayer address from config
  const relayerAddress = config.velumxRelayerAddress; 

  // SAFETY LOCK: Block the transaction if the address is not configured
  if (!relayerAddress) {
    throw new Error('VelumX Configuration Error: Relayer Address is not set. Please add NEXT_PUBLIC_VELUMX_RELAYER_ADDRESS to your environment variables.');
  }
  
  onProgress?.('Preparing transaction...');
  
  const connect = await getStacksConnect();
  const network = await getNetworkInstance();
  const [contractAddress, contractName] = config.stacksPaymasterAddress.split('.');
  
  // Call bridge-gasless with sponsored=true
  const result = await new Promise<{ txid?: string; txRaw?: string } | null>((resolve, reject) => {
    connect.openContractCall({
      contractAddress,
      contractName,
      functionName: 'bridge-gasless',
      functionArgs: [
        Cl.uint(amountInMicro.toString()),
        Cl.buffer(recipientBytes),
        Cl.uint(feeInMicro.toString()),
        Cl.principal(relayerAddress),
        Cl.principal(config.stacksUsdcxAddress)
      ],
      network,
      sponsored: true, // This is the key - Stacks native sponsorship
      postConditionMode: 'allow',
      postConditions: [],
      onFinish: (data: any) => {
        console.log('Bridge onFinish data:', data);
        resolve(data);
      },
      onCancel: () => {
        resolve(null);
      },
    });
  });

  if (!result) {
    throw new Error('Transaction was cancelled');
  }

  onProgress?.('Broadcasting transaction...');

  // If we have txRaw, broadcast it via relayer
  if (result.txRaw) {
    const broadcastResult = await velumx.submitRawTransaction(result.txRaw);
    console.log('Bridge broadcast result:', broadcastResult);
    return broadcastResult.txid;
  }

  // Otherwise use the txid from the response
  const txid = result.txid || (result as any).txId || (result as any).result?.txid;
  if (txid) {
    return txid;
  }

  throw new Error('No transaction ID returned');
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
