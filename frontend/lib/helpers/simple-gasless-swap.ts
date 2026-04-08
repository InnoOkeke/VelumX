/**
 * Simple Gasless Swap Helper
 *
 * Builds a sponsored Stacks transaction using @stacks/transactions,
 * then uses openSignTransaction so the wallet shows "Sign" not "Confirm with fee".
 *
 * Flow:
 *   1. Estimate fee via VelumX relayer
 *   2. Get swap contract call params from ALEX SDK
 *   3. Build a sponsored transaction using makeContractCall with sponsored:true
 *   4. User signs via openSignTransaction — no STX fee shown
 *   5. VelumX relayer adds sponsor signature and broadcasts
 */

import { getConfig } from '../config';
import { getVelumXClient } from '../velumx';
import { getStacksConnect, getNetworkInstance } from '../stacks-loader';
import { AlexSDK } from 'alex-sdk';
import {
  makeUnsignedContractCall,
  PostConditionMode,
  serializeTransaction,
} from '@stacks/transactions';

export interface SimpleGaslessSwapParams {
  userAddress: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;  // micro units string
  minOut: string;    // micro units string
  feeToken?: string;
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

  // Step 2: Resolve ALEX internal currency IDs
  onProgress?.('Preparing transaction...');
  const alex = new AlexSDK();

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

  // Step 3: Get swap tx params from ALEX SDK
  const swapTx = await alex.runSwap(
    params.userAddress,
    alexTokenIn,
    alexTokenOut,
    BigInt(amountIn),
    BigInt(minOut)
  );

  const network = await getNetworkInstance();

  // Step 4: Build a sponsored transaction using @stacks/transactions
  // sponsored: true marks the fee slot as empty — relayer fills it
  const tx = await makeUnsignedContractCall({
    contractAddress: swapTx.contractAddress,
    contractName: swapTx.contractName,
    functionName: swapTx.functionName,
    functionArgs: swapTx.functionArgs,
    postConditions: swapTx.postConditions,
    postConditionMode: PostConditionMode.Deny,
    network,
    sponsored: true,
    fee: 0n,
    publicKey: '', // will be filled by wallet when signing
  });

  // serializeTransaction returns hex string in @stacks/transactions v7+
  const txHex = serializeTransaction(tx);

  // Step 5: User signs the sponsored transaction
  // openSignTransaction shows "Sign" not "Confirm with fee"
  const connect = await getStacksConnect();

  return new Promise<string>((resolve, reject) => {
    if (!connect?.openSignTransaction) {
      // Fallback: if openSignTransaction not available, broadcast directly
      onProgress?.('Broadcasting via VelumX...');
      velumx.sponsor(txHex, {
        feeToken: isDeveloperSponsored ? undefined : selectedFeeToken,
        feeAmount: isDeveloperSponsored ? '0' : feeAmount,
        network: config.stacksNetwork as 'mainnet' | 'testnet'
      }).then(result => resolve(result.txid)).catch(reject);
      return;
    }

    connect.openSignTransaction({
      txHex,
      network,
      onFinish: async (data: any) => {
        console.log('Swap signed:', data);
        onProgress?.('Broadcasting via VelumX...');

        try {
          const signedTxHex = data.txHex || data.txRaw || txHex;

          const result = await velumx.sponsor(signedTxHex, {
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
