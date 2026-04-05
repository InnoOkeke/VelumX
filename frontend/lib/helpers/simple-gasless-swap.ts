/**
 * Simple Gasless Swap Helper
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

export interface SimpleGaslessSwapParams {
  userAddress: string;
  tokenIn: string;  // Token contract address (e.g., "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.token-wstx")
  tokenOut: string; // Token contract address
  amountIn: string; // Amount in human-readable format
  minOut: string;   // Minimum output amount
  feeToken?: string; // NEW: Universal Gas Token
  onProgress?: (step: string) => void;
}

/**
 * Execute gasless swap using universal-paymaster
 * User pays gas fees in any whitelisted SIP-010 token, relayer sponsors STX
 */
export async function executeSimpleGaslessSwap(params: SimpleGaslessSwapParams): Promise<string> {
  const { userAddress, tokenIn, tokenOut, amountIn, minOut, feeToken, onProgress } = params;
  const config = getConfig();
  const velumx = getVelumXClient();
  
  // Convert amounts to micro units (6 decimals)
  const amountInMicro = parseUnits(amountIn, 6);
  const minOutMicro = parseUnits(minOut, 6);
  
  // Get universal fee estimate
  onProgress?.('Calculating universal fees...');
  const selectedFeeToken = feeToken || config.stacksUsdcxAddress;
  
  // Cast to any or a local interface to support the new 'maxFee' field from the updated relayer
  const estimate = await velumx.estimateFee({ 
    estimatedGas: 150000,
    feeToken: selectedFeeToken 
  }) as any;
  
  const feeInMicro = BigInt(estimate.maxFee || estimate.maxFeeUSDCx || 0);
  
  console.log('Universal Swap Details:', {
    tokenIn,
    tokenOut,
    amountIn: amountInMicro.toString(),
    feeToken: selectedFeeToken,
    fee: feeInMicro.toString()
  });
  
  // Get relayer address from config or default
  const relayerAddress = config.stacksPaymasterAddress.split('.')[0]; 
  
  onProgress?.('Preparing transaction...');
  
  const connect = await getStacksConnect();
  const network = await getNetworkInstance();
  
  // Use the new Universal Paymaster v1
  const contractAddress = config.stacksPaymasterAddress.split('.')[0];
  const contractName = 'universal-paymaster-v1';
  
  // Call swap-gasless-v2 with sponsored=true
  const result = await new Promise<{ txid?: string; txRaw?: string } | null>((resolve, reject) => {
    connect.openContractCall({
      contractAddress,
      contractName,
      functionName: 'swap-gasless-v2',
      functionArgs: [
        Cl.principal(selectedFeeToken),
        Cl.uint(feeInMicro.toString()),
        Cl.principal(relayerAddress),
        Cl.principal(tokenIn),
        Cl.principal(tokenOut),
        Cl.uint(amountInMicro.toString()),
        Cl.uint(minOutMicro.toString())
      ],
      network,
      sponsored: true, 
      postConditionMode: 'allow',
      postConditions: [],
      onFinish: (data: any) => {
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
    const broadcastResult = await velumx.sponsor(result.txRaw, { feeAmount: feeInMicro.toString() });
    console.log('Swap broadcast result:', broadcastResult);
    return broadcastResult.txid;
  }

  // Otherwise use the txid from the response
  const txid = result.txid || (result as any).txId || (result as any).result?.txid;
  if (txid) {
    return txid;
  }

  throw new Error('No transaction ID returned');
}
