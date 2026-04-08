/**
 * Simple Gasless Swap Helper — Sponsored Transaction Flow
 *
 * Root cause of "Cannot sponsor sign a non-sponsored transaction":
 *   openContractCall({ sponsored: true }) in @stacks/connect 8.x does NOT reliably
 *   set AuthType.Sponsored on the transaction. The wallet builds a Standard tx,
 *   signs+broadcasts it, and the relayer's sponsorTransaction() call fails.
 *
 * Fix:
 *   1. alex.runSwap() → extract contract call params (no wallet interaction)
 *   2. makeUnsignedContractCall({ sponsored: true }) → explicitly sets AuthType.Sponsored
 *   3. request('stx_signTransaction') → wallet signs ONLY, no broadcast, returns signed hex
 *   4. Relayer calls sponsorTransaction() → adds sponsor sig → broadcasts
 *
 * This guarantees AuthType.Sponsored is set before the wallet ever sees the tx.
 */

import { getConfig } from '../config';
import { getVelumXClient } from '../velumx';
import { getNetworkInstance, getStacksTransactions } from '../stacks-loader';
import { AlexSDK } from 'alex-sdk';
import { request } from '@stacks/connect';

export interface SimpleGaslessSwapParams {
  userAddress: string;
  userPublicKey?: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;         // micro units in token's native decimals
  minOut: string;           // in ALEX 1e8 units (bigint string)
  tokenInDecimals?: number;
  feeToken?: string;
  onProgress?: (step: string) => void;
}

function toAlexAmount(microUnits: string, tokenDecimals: number): bigint {
  const human = Number(microUnits) / Math.pow(10, tokenDecimals);
  return BigInt(Math.floor(human * 1e8));
}

export async function executeSimpleGaslessSwap(params: SimpleGaslessSwapParams): Promise<string> {
  const { tokenIn, tokenOut, amountIn, minOut, tokenInDecimals = 6, feeToken, onProgress } = params;

  const config = getConfig();
  const velumx = getVelumXClient();
  const selectedFeeToken = feeToken || config.stacksUsdcxAddress;

  // Step 1: Estimate fee
  onProgress?.('Calculating fees...');
  const estimate = await velumx.estimateFee({ feeToken: selectedFeeToken, estimatedGas: 150000 });
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
  const alexMinOut = BigInt(minOut);

  // Step 3: Get swap contract call params from ALEX SDK (no wallet interaction)
  const swapTx = await alex.runSwap(params.userAddress, alexTokenIn, alexTokenOut, alexAmountIn, alexMinOut);
  console.log('ALEX swap tx:', { contract: `${swapTx.contractAddress}.${swapTx.contractName}`, fn: swapTx.functionName });

  // Step 4: Build unsigned tx with AuthType.Sponsored using makeUnsignedContractCall
  // This is the ONLY way to guarantee the tx has AuthType.Sponsored before signing.
  // openContractCall({ sponsored: true }) is unreliable in @stacks/connect 8.x —
  // the wallet may ignore the flag and build a Standard tx.
  const txLib = await getStacksTransactions();
  const network = await getNetworkInstance();

  // publicKey is required for makeUnsignedContractCall.
  // Fetch it via stx_getAddresses if not already available.
  let publicKey = params.userPublicKey || '';
  if (!publicKey) {
    try {
      console.log('Fetching public key via stx_getAddresses...');
      const addrResult = await request('stx_getAddresses') as any;
      console.log('stx_getAddresses result:', JSON.stringify(addrResult));
      const stxEntry = (addrResult?.addresses || []).find((a: any) =>
        a.address === params.userAddress
      ) || (addrResult?.addresses || [])[0];
      publicKey = stxEntry?.publicKey || '';
      console.log('Public key:', publicKey ? publicKey.slice(0, 10) + '...' : 'NOT FOUND');
    } catch (e) {
      console.error('stx_getAddresses failed:', e);
    }
  }

  if (!publicKey) {
    throw new Error(
      'Cannot build sponsored transaction: wallet public key not available. ' +
      'Please disconnect and reconnect your wallet.'
    );
  }

  let txHex: string;
  try {
    console.log('Building unsigned sponsored tx with publicKey:', publicKey.slice(0, 10) + '...');
    const transaction = await txLib.makeUnsignedContractCall({
      contractAddress: swapTx.contractAddress,
      contractName: swapTx.contractName,
      functionName: swapTx.functionName,
      functionArgs: swapTx.functionArgs,
      // ALEX SDK returns post-conditions in @stacks/connect string format,
      // not the wire format makeUnsignedContractCall expects.
      // Use Allow mode — the contract enforces min-dy on-chain anyway.
      postConditionMode: txLib.PostConditionMode?.Allow ?? 1,
      postConditions: [],
      network,
      sponsored: true,
      publicKey,
      fee: 0n,
      validateWithAbi: false,
    });
    txHex = transaction.serialize(); // already returns hex string in @stacks/transactions 7.x
    console.log('Built AuthType.Sponsored tx OK, length:', txHex.length);
  } catch (buildErr: any) {
    console.error('makeUnsignedContractCall failed:', buildErr);
    throw new Error(`Failed to build sponsored transaction: ${buildErr?.message || buildErr}`);
  }

  // Step 5: Wallet signs WITHOUT broadcasting
  onProgress?.('Waiting for wallet signature...');
  console.log('Calling stx_signTransaction...');

  let signedTxHex: string;
  try {
    const signResult = await request('stx_signTransaction', {
      transaction: txHex,  // correct param name per SignTransactionParams type
      broadcast: false,    // explicitly do NOT broadcast — relayer handles this
    });

    console.log('stx_signTransaction result keys:', Object.keys(signResult || {}));
    signedTxHex = (signResult as any).transaction || (signResult as any).txHex;
    if (!signedTxHex) throw new Error('Wallet did not return signed tx hex');
    console.log('Wallet signed sponsored tx OK');
  } catch (err: any) {
    console.error('stx_signTransaction error:', err);
    if (err?.message?.toLowerCase().includes('cancel') || err?.code === 4001) {
      throw new Error('Swap cancelled by user');
    }
    throw err;
  }

  // Step 6: Relayer adds sponsor signature and broadcasts
  onProgress?.('Broadcasting via VelumX...');
  const result = await velumx.sponsor(signedTxHex, {
    feeToken: isDeveloperSponsored ? undefined : selectedFeeToken,
    feeAmount: isDeveloperSponsored ? '0' : feeAmount,
    network: config.stacksNetwork as 'mainnet' | 'testnet'
  });

  console.log('VelumX sponsor result:', result);
  return result.txid;
}
