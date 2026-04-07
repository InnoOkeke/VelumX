/**
 * Simple Gasless Swap Helper
 *
 * Uses VelumXClient (v3) + @stacks/connect to execute gasless swaps.
 *
 * Flow:
 *   1. Estimate fee in user's chosen SIP-010 token via VelumX relayer
 *   2. Build the swap transaction using ALEX SDK with sponsored: true
 *   3. User signs — wallet produces a raw tx hex
 *   4. VelumX relayer sponsors the STX fee and broadcasts
 */

import { getConfig } from '../config';
import { getVelumXClient } from '../velumx';
import { getStacksConnect, getNetworkInstance } from '../stacks-loader';
import { AlexSDK } from 'alex-sdk';
import { PostConditionMode, Cl } from '@stacks/transactions';

export interface SimpleGaslessSwapParams {
  userAddress: string;
  tokenIn: string;   // ALEX currency id or contract principal
  tokenOut: string;  // ALEX currency id or contract principal
  amountIn: string;  // Amount in micro units
  minOut: string;    // Minimum output in micro units
  feeToken?: string; // SIP-010 contract principal for gas payment
  onProgress?: (step: string) => void;
}

export async function executeSimpleGaslessSwap(params: SimpleGaslessSwapParams): Promise<string> {
  const { tokenIn, tokenOut, amountIn, minOut, feeToken, onProgress } = params;
  const config = getConfig();
  const velumx = getVelumXClient();

  const selectedFeeToken = feeToken || config.stacksUsdcxAddress;

  // Step 1: Estimate fee
  onProgress?.('Calculating fees...');
  const estimate = await velumx.estimateFee({
    feeToken: selectedFeeToken,
    estimatedGas: 150000
  });

  const feeAmount = estimate.maxFee || '0';
  const isDeveloperSponsored = estimate.policy === 'DEVELOPER_SPONSORS';

  console.log('VelumX Gasless Swap:', { tokenIn, tokenOut, amountIn, minOut, feeToken: selectedFeeToken, feeAmount, policy: estimate.policy });

  // Step 2: Build the swap transaction using ALEX SDK
  onProgress?.('Preparing transaction...');

  const alex = new AlexSDK();
  const connect = await getStacksConnect();
  const network = await getNetworkInstance();

  // Resolve ALEX internal currency IDs from contract addresses
  const resolveAlexId = async (token: string): Promise<string> => {
    if (token === 'token-wstx' || token === 'STX') return 'token-wstx';
    try {
      const allTokens = await alex.fetchSwappableCurrency();
      const match = allTokens.find((t: any) => {
        const contractAddr = t.wrapToken ? t.wrapToken.split('::')[0] : t.id;
        return contractAddr?.toLowerCase() === token?.toLowerCase() ||
               t.id?.toLowerCase() === token?.toLowerCase();
      });
      if (match) return match.id;
    } catch (e) {}
    return token;
  };

  const alexTokenIn = await resolveAlexId(tokenIn) as any;
  const alexTokenOut = await resolveAlexId(tokenOut) as any;

  // Get the swap transaction from ALEX SDK
  const swapTx = await alex.runSwap(
    params.userAddress,
    alexTokenIn,
    alexTokenOut,
    BigInt(amountIn),
    BigInt(minOut)
  );

  // Step 3: User signs the transaction (sponsored = true means user doesn't pay STX)
  return new Promise<string>((resolve, reject) => {
    connect.openContractCall({
      ...swapTx,
      network,
      sponsored: true,
      postConditionMode: PostConditionMode.Allow,
      onFinish: async (data: any) => {
        console.log('Swap signed:', data);
        onProgress?.('Broadcasting via VelumX...');

        try {
          const txRaw = data.txRaw || data.txHex;
          if (!txRaw) {
            // If wallet already broadcasted (non-sponsored path), use txid directly
            const txid = data.txId || data.txid;
            if (txid) return resolve(txid);
            return reject(new Error('No transaction data returned from wallet'));
          }

          // Step 4: VelumX relayer sponsors the STX fee and broadcasts
          const result = await velumx.sponsor(txRaw, {
            feeToken: isDeveloperSponsored ? undefined : selectedFeeToken,
            feeAmount: isDeveloperSponsored ? '0' : feeAmount,
            network: config.stacksNetwork as 'mainnet' | 'testnet'
          });

          console.log('VelumX sponsor result:', result);
          resolve(result.txid);
        } catch (error) {
          console.error('Broadcast error:', error);
          reject(error);
        }
      },
      onCancel: () => reject(new Error('Swap cancelled by user'))
    });
  });
}
