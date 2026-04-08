/**
 * Simple Gasless Swap Helper — Sponsored Transaction Flow
 *
 * Correct flow per @stacks/connect v8 + @stacks/transactions docs:
 *
 *  1. ALEX SDK: get swap route/contract call params (no wallet interaction)
 *  2. @stacks/transactions makeUnsignedContractCall({ sponsored: true, publicKey })
 *     — builds the tx with the user's public key, marks auth as sponsored
 *  3. @stacks/connect request('stx_signTransaction', { txHex })
 *     — wallet signs the tx WITHOUT broadcasting it, returns signed hex
 *  4. VelumX relayer: sponsorTransaction() adds sponsor co-sig, then broadcasts
 *
 * Key: makeUnsignedContractCall requires the user's publicKey (not senderKey).
 * The wallet signs via stx_signTransaction — the only v8 API that returns signed hex
 * without broadcasting.
 */

import { getConfig } from '../config';
import { getVelumXClient } from '../velumx';
import { getNetworkInstance, getStacksTransactions } from '../stacks-loader';
import { AlexSDK } from 'alex-sdk';
import { request } from '@stacks/connect';

export interface SimpleGaslessSwapParams {
  userAddress: string;
  userPublicKey: string;     // required for building unsigned sponsored tx
  tokenIn: string;
  tokenOut: string;
  amountIn: string;          // micro units in token's native decimals
  minOut: string;            // micro units in token's native decimals
  tokenInDecimals?: number;
  tokenOutDecimals?: number;
  feeToken?: string;
  onProgress?: (step: string) => void;
}

// ALEX SDK uses 1e8 (8 decimals) internally
function toAlexAmount(microUnits: string, tokenDecimals: number): bigint {
  const human = Number(microUnits) / Math.pow(10, tokenDecimals);
  return BigInt(Math.floor(human * 1e8));
}

export async function executeSimpleGaslessSwap(params: SimpleGaslessSwapParams): Promise<string> {
  const {
    tokenIn, tokenOut, amountIn, minOut,
    tokenInDecimals = 6, tokenOutDecimals = 6,
    feeToken, onProgress
  } = params;

  const config = getConfig();
  const velumx = getVelumXClient();
  const selectedFeeToken = feeToken || config.stacksUsdcxAddress;

  if (!params.userPublicKey) {
    throw new Error('User public key is required for sponsored transactions. Please reconnect your wallet.');
  }

  // Step 1: Estimate fee
  onProgress?.('Calculating fees...');
  const estimate = await velumx.estimateFee({
    feeToken: selectedFeeToken,
    estimatedGas: 150000
  });
  const feeAmount = estimate.maxFee || '0';
  const isDeveloperSponsored = estimate.policy === 'DEVELOPER_SPONSORS';

  console.log('VelumX Gasless Swap:', { tokenIn, tokenOut, amountIn, minOut, feeAmount, policy: estimate.policy });

  // Step 2: Resolve ALEX internal token IDs
  onProgress?.('Preparing transaction...');
  const alex = new AlexSDK();

  const resolveAlexId = async (token: string): Promise<string> => {
    if (token === 'token-wstx' || token === 'STX') return 'token-wstx';
    if (!token.includes('.') && !token.startsWith('SP') && !token.startsWith('ST')) return token;
    try {
      const allTokens = await alex.fetchSwappableCurrency();
      const match = allTokens.find((t: any) => {
        const contractAddr = t.wrapToken ? t.wrapToken.split('::')[0] : '';
        return contractAddr?.toLowerCase() === token?.toLowerCase() ||
               t.id?.toLowerCase() === token?.toLowerCase();
      });
      if (match) return match.id;
    } catch (e) {
      console.warn('ALEX token resolution failed:', e);
    }
    throw new Error(`Token not supported by ALEX: ${token}`);
  };

  const alexTokenIn = await resolveAlexId(tokenIn) as any;
  const alexTokenOut = await resolveAlexId(tokenOut) as any;
  const alexAmountIn = toAlexAmount(amountIn, tokenInDecimals);
  const alexMinOut = toAlexAmount(minOut, tokenOutDecimals);

  // Step 3: Get swap tx params from ALEX SDK (no wallet popup)
  const swapTx = await alex.runSwap(
    params.userAddress,
    alexTokenIn,
    alexTokenOut,
    alexAmountIn,
    alexMinOut
  );
  console.log('ALEX swap tx params:', swapTx);

  // Step 4: Build unsigned sponsored tx using makeUnsignedContractCall
  // This requires the user's publicKey (not senderKey) and sets sponsored: true
  // so the auth type is set to sponsored — relayer must co-sign before broadcast
  const txLib = await getStacksTransactions();
  const network = await getNetworkInstance();

  const transaction = await txLib.makeUnsignedContractCall({
    contractAddress: swapTx.contractAddress,
    contractName: swapTx.contractName,
    functionName: swapTx.functionName,
    functionArgs: swapTx.functionArgs,
    postConditions: swapTx.postConditions ?? [],
    network,
    sponsored: true,
    publicKey: params.userPublicKey,
    fee: 0n,
    validateWithAbi: false,
  });

  const txHex = txLib.bytesToHex(transaction.serialize());
  console.log('Built unsigned sponsored tx:', txHex.slice(0, 40) + '...');

  // Step 5: Wallet signs the sponsored tx WITHOUT broadcasting
  // stx_signTransaction is the correct @stacks/connect v8 API:
  // — wallet signs the tx and returns the signed hex
  // — wallet does NOT broadcast (unlike stx_callContract which broadcasts immediately)
  onProgress?.('Waiting for wallet signature...');

  let signedTxHex: string;
  try {
    const signResult = await request('stx_signTransaction', {
      txHex,
      network: 'mainnet',
    } as any);

    signedTxHex = (signResult as any).txHex || (signResult as any).transaction;
    if (!signedTxHex) throw new Error('Wallet did not return signed tx hex');
    console.log('Wallet signed sponsored tx:', signedTxHex.slice(0, 40) + '...');
  } catch (err: any) {
    if (err?.message?.toLowerCase().includes('cancel') || err?.code === 4001) {
      throw new Error('Swap cancelled by user');
    }
    throw err;
  }

  // Step 6: Send signed sponsored tx to VelumX relayer
  // Relayer calls sponsorTransaction() to add its co-signature, then broadcasts
  onProgress?.('Broadcasting via VelumX...');
  const result = await velumx.sponsor(signedTxHex, {
    feeToken: isDeveloperSponsored ? undefined : selectedFeeToken,
    feeAmount: isDeveloperSponsored ? '0' : feeAmount,
    network: config.stacksNetwork as 'mainnet' | 'testnet'
  });

  console.log('VelumX sponsor result:', result);
  return result.txid;
}
