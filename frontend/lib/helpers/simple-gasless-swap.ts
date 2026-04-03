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
  onProgress?: (step: string) => void;
}

/**
 * Execute gasless swap using simple-paymaster
 * User pays gas fees in USDCx, relayer sponsors STX
 */
export async function executeSimpleGaslessSwap(params: SimpleGaslessSwapParams): Promise<string> {
  const { userAddress, tokenIn, tokenOut, amountIn, minOut, onProgress } = params;
  const config = getConfig();
  const velumx = getVelumXClient();
  
  // Convert amounts to micro units (6 decimals)
  const amountInMicro = parseUnits(amountIn, 6);
  const minOutMicro = parseUnits(minOut, 6);
  
  // Get fee estimate
  onProgress?.('Calculating fees...');
  const estimate = await velumx.estimateFee({ estimatedGas: 150000 });
  const feeInMicro = BigInt(estimate.maxFeeUSDCx);
  
  console.log('Simple Swap Details:', {
    tokenIn,
    tokenOut,
    amountIn: amountInMicro.toString(),
    minOut: minOutMicro.toString(),
    fee: feeInMicro.toString()
  });
  
  // Get relayer address
  const relayerAddress = 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P';
  
  onProgress?.('Preparing transaction...');
  
  const connect = await getStacksConnect();
  const network = await getNetworkInstance();
  const [contractAddress, contractName] = config.stacksPaymasterAddress.split('.');
  
  // Call swap-gasless with sponsored=true
  const result = await new Promise<{ txid?: string; txRaw?: string } | null>((resolve, reject) => {
    connect.openContractCall({
      contractAddress,
      contractName,
      functionName: 'swap-gasless',
      functionArgs: [
        Cl.principal(tokenIn),
        Cl.principal(tokenOut),
        Cl.uint(amountInMicro.toString()),
        Cl.uint(minOutMicro.toString()),
        Cl.uint(feeInMicro.toString()),
        Cl.principal(relayerAddress),
        Cl.principal(config.stacksUsdcxAddress)
      ],
      network,
      sponsored: true, // Stacks native sponsorship
      postConditionMode: 'allow',
      postConditions: [],
      onFinish: (data: any) => {
        console.log('Swap onFinish data:', data);
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
    const broadcastResult = await velumx.sponsor(result.txRaw, undefined, feeInMicro.toString());
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
