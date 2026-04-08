/**
 * Simple Gasless Swap Helper
 *
 * Uses VelumX SDK v3 + ALEX SDK for gasless swaps.
 * The user signs the transaction, VelumX relayer pays the STX fee.
 *
 * Note on wallet UX: Some wallets (Xverse) still display an estimated fee
 * even for sponsored transactions. The user does NOT actually pay this fee —
 * the relayer replaces it when sponsoring. The user only needs to click "Confirm".
 */

import { getConfig } from '../config';
import { getVelumXClient } from '../velumx';
import { getStacksConnect, getNetworkInstance } from '../stacks-loader';
import { AlexSDK } from 'alex-sdk';

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

  const connect = await getStacksConnect();
  const network = await getNetworkInstance();

  // Step 4: User signs the transaction
  // sponsored: true tells @stacks/connect to build a sponsored tx
  // The wallet may show an estimated fee — this is display only.
  // The relayer replaces the fee when it sponsors the transaction.
  return new Promise<string>((resolve, reject) => {
    connect.openContractCall({
      contractAddress: swapTx.contractAddress,
      contractName: swapTx.contractName,
      functionName: swapTx.functionName,
      functionArgs: swapTx.functionArgs,
      postConditions: swapTx.postConditions,
      network,
      sponsored: true,
      onFinish: async (data: any) => {
        console.log('Swap signed:', data);
        onProgress?.('Broadcasting via VelumX...');

        try {
          // data.txRaw is the signed sponsored tx hex
          const txRaw = data.txRaw || data.txHex;
          if (!txRaw) {
            // Wallet already broadcasted (non-sponsored path)
            const txid = data.txId || data.txid;
            if (txid) return resolve(txid);
            return reject(new Error('No transaction data returned'));
          }

          // Step 5: VelumX relayer adds sponsor signature and broadcasts
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
