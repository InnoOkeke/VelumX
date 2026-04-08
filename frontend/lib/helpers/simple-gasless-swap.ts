/**
 * Simple Gasless Swap Helper — Sponsored Transaction Flow
 *
 * Flow:
 *  1. ALEX SDK runSwap() → get contract call params (no wallet popup)
 *  2. makeUnsignedContractCall({ sponsored: true, publicKey }) → build unsigned tx hex
 *  3. request('stx_signTransaction', { txHex }) → wallet signs WITHOUT broadcasting
 *  4. VelumX relayer: sponsorTransaction() adds sponsor co-sig + broadcasts
 *
 * Public key is fetched at connect time via request('stx_getAddresses') in useWallet.
 * If missing, falls back to openContractCall with sponsored: true.
 */

import { getConfig } from '../config';
import { getVelumXClient } from '../velumx';
import { getStacksConnect, getNetworkInstance, getStacksTransactions } from '../stacks-loader';
import { AlexSDK } from 'alex-sdk';
import { request } from '@stacks/connect';

export interface SimpleGaslessSwapParams {
  userAddress: string;
  userPublicKey?: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;          // micro units in token's native decimals
  minOut: string;            // in ALEX 1e8 units (bigint string)
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
  const alexMinOut = BigInt(minOut); // already in 1e8 units

  // Step 3: Get swap tx params from ALEX SDK (no wallet popup)
  const swapTx = await alex.runSwap(params.userAddress, alexTokenIn, alexTokenOut, alexAmountIn, alexMinOut);
  console.log('ALEX swap tx:', { contract: `${swapTx.contractAddress}.${swapTx.contractName}`, fn: swapTx.functionName });

  const network = await getNetworkInstance();

  // Step 4a: If we have the public key, build unsigned tx + use stx_signTransaction
  // This is the cleanest sponsored tx flow — wallet signs, never broadcasts
  if (params.userPublicKey) {
    try {
      const txLib = await getStacksTransactions();

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

      const txHex = Buffer.from(transaction.serialize()).toString('hex');
      console.log('Built unsigned sponsored tx:', txHex.slice(0, 40) + '...');

      onProgress?.('Waiting for wallet signature...');
      const signResult = await request('stx_signTransaction', { txHex, network: 'mainnet' } as any);
      const signedTxHex = (signResult as any).txHex || (signResult as any).transaction;

      if (signedTxHex) {
        console.log('Wallet signed tx via stx_signTransaction');
        onProgress?.('Broadcasting via VelumX...');
        const result = await velumx.sponsor(signedTxHex, {
          feeToken: isDeveloperSponsored ? undefined : selectedFeeToken,
          feeAmount: isDeveloperSponsored ? '0' : feeAmount,
          network: config.stacksNetwork as 'mainnet' | 'testnet'
        });
        return result.txid;
      }
    } catch (err: any) {
      if (err?.message?.toLowerCase().includes('cancel') || err?.code === 4001) {
        throw new Error('Swap cancelled by user');
      }
      // Fall through to openContractCall if stx_signTransaction fails
      console.warn('stx_signTransaction failed, falling back to openContractCall:', err?.message);
    }
  }

  // Step 4b: Fallback — openContractCall with sponsored: true
  // Wallet builds tx internally, shows popup, returns txRaw in onFinish
  const connect = await getStacksConnect();
  onProgress?.('Waiting for wallet signature...');

  return new Promise<string>((resolve, reject) => {
    connect.openContractCall({
      contractAddress: swapTx.contractAddress,
      contractName: swapTx.contractName,
      functionName: swapTx.functionName,
      functionArgs: swapTx.functionArgs,
      postConditions: swapTx.postConditions ?? [],
      network,
      sponsored: true,
      onFinish: async (data: any) => {
        console.log('Wallet onFinish:', Object.keys(data));
        const txRaw = data.txRaw;

        if (!txRaw) {
          // Wallet broadcast directly (ignored sponsored flag)
          const txid = data.txId || data.txid;
          if (txid) {
            console.warn('Wallet broadcast directly — user paid fee');
            return resolve(txid);
          }
          return reject(new Error('No transaction data returned from wallet'));
        }

        onProgress?.('Broadcasting via VelumX...');
        try {
          const result = await velumx.sponsor(txRaw, {
            feeToken: isDeveloperSponsored ? undefined : selectedFeeToken,
            feeAmount: isDeveloperSponsored ? '0' : feeAmount,
            network: config.stacksNetwork as 'mainnet' | 'testnet'
          });
          resolve(result.txid);
        } catch (err) {
          reject(err);
        }
      },
      onCancel: () => reject(new Error('Swap cancelled by user'))
    });
  });
}
