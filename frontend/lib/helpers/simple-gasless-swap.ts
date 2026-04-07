/**
 * Simple Gasless Swap Helper
 * Uses VelumX SDK's SimplePaymaster for gasless swaps
 * 
 * This integrates with the VelumX SDK to enable users to pay gas fees
 * in any SIP-010 token instead of STX.
 */

import { getConfig } from '../config';
import { getVelumXClient } from '../velumx';
import { SimplePaymaster } from '@velumx/sdk';

export interface SimpleGaslessSwapParams {
  userAddress: string;
  tokenIn: string;  // Token contract address (e.g., "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.token-wstx")
  tokenOut: string; // Token contract address
  amountIn: string; // Amount in micro units (e.g., "1000000" for 1 token with 6 decimals)
  minOut: string;   // Minimum output amount in micro units
  feeToken?: string; // Universal Gas Token contract address
  onProgress?: (step: string) => void;
}

/**
 * Execute gasless swap using VelumX SDK
 * User pays gas fees in any whitelisted SIP-010 token, relayer sponsors STX
 */
export async function executeSimpleGaslessSwap(params: SimpleGaslessSwapParams): Promise<string> {
  const { tokenIn, tokenOut, amountIn, minOut, feeToken, onProgress } = params;
  const config = getConfig();
  const velumx = getVelumXClient();
  
  // Get universal fee estimate
  onProgress?.('Calculating universal fees...');
  const selectedFeeToken = feeToken || config.stacksUsdcxAddress;
  
  const estimate = await velumx.estimateFee({ 
    estimatedGas: 150000,
    feeToken: selectedFeeToken 
  }) as any;
  
  const feeAmount = estimate.maxFee || '0';
  
  console.log('VelumX Gasless Swap:', {
    tokenIn,
    tokenOut,
    amountIn,
    minOut,
    feeToken: selectedFeeToken,
    feeAmount
  });
  
  onProgress?.('Preparing gasless transaction...');
  
  // Initialize VelumX SimplePaymaster
  const paymaster = new SimplePaymaster({
    network: config.stacksNetwork as 'mainnet' | 'testnet',
    paymasterContract: config.stacksPaymasterAddress,
    relayerAddress: config.stacksPaymasterAddress.split('.')[0],
    relayerUrl: '/api/velumx/proxy',
    apiKey: 'proxied' // Using proxy, no direct API key needed
  });

  // Execute gasless swap using VelumX SDK
  return new Promise<string>((resolve, reject) => {
    paymaster.swapGasless({
      tokenIn,
      tokenOut,
      amountIn,
      minOut,
      feeAmount,
      feeToken: selectedFeeToken,
      onFinish: async (data: any) => {
        console.log('Swap transaction signed:', data);
        onProgress?.('Broadcasting transaction...');
        
        try {
          // Broadcast via VelumX relayer for sponsorship
          if (data.txRaw) {
            const broadcastResult = await velumx.sponsor(data.txRaw, { 
              feeAmount,
              feeToken: selectedFeeToken,
              network: config.stacksNetwork as 'mainnet' | 'testnet'
            } as any);
            
            console.log('Swap broadcast result:', broadcastResult);
            resolve(broadcastResult.txid);
          } else if (data.txId || data.txid) {
            // Transaction already broadcasted
            resolve(data.txId || data.txid);
          } else {
            reject(new Error('No transaction ID returned'));
          }
        } catch (error) {
          console.error('Broadcast error:', error);
          reject(error);
        }
      },
      onCancel: () => {
        reject(new Error('Swap cancelled by user'));
      }
    });
  });
}
