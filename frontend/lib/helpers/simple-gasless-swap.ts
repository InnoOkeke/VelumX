/**
 * Simple Gasless Swap Helper — Sponsored Transaction Flow
 *
 * Uses makeUnsignedContractCall (direct import) + stx_signTransaction.
 * Direct import avoids the stacks-loader cache which may return wrong module version.
 */

import { getConfig } from '../config';
import { getVelumXClient } from '../velumx';
import { getNetworkInstance } from '../stacks-loader';
import { AlexSDK } from 'alex-sdk';
import { request } from '@stacks/connect';
import {
  makeUnsignedContractCall,
  PostConditionMode,
} from '@stacks/transactions';

export interface SimpleGaslessSwapParams {
  userAddress: string;
  userPublicKey?: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  minOut: string;           // ALEX 1e8 units (bigint string)
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

  // Step 2: Resolve ALEX token IDs
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
    } catch (e) { console.warn('ALEX token resolution failed:', e); }
    throw new Error(`Token not supported by ALEX: ${token}`);
  };

  const alexTokenIn = await resolveAlexId(tokenIn) as any;
  const alexTokenOut = await resolveAlexId(tokenOut) as any;
  const alexAmountIn = toAlexAmount(amountIn, tokenInDecimals);
  const alexMinOut = BigInt(minOut);

  // Step 3: Get swap params from ALEX SDK
  const swapTx = await alex.runSwap(params.userAddress, alexTokenIn, alexTokenOut, alexAmountIn, alexMinOut);
  console.log('ALEX swap tx:', { contract: `${swapTx.contractAddress}.${swapTx.contractName}`, fn: swapTx.functionName });

  // Step 4: Get public key
  let publicKey = params.userPublicKey || '';
  if (!publicKey) {
    try {
      const addrResult = await request('stx_getAddresses') as any;
      const stxEntry = (addrResult?.addresses || []).find((a: any) => a.address === params.userAddress)
        || (addrResult?.addresses || [])[0];
      publicKey = stxEntry?.publicKey || '';
      console.log('Public key from stx_getAddresses:', publicKey ? publicKey.slice(0, 10) + '...' : 'NOT FOUND');
    } catch (e) { console.warn('stx_getAddresses failed:', e); }
  }

  if (!publicKey) throw new Error('Wallet public key not available. Please reconnect your wallet.');

  // Step 5: Fetch current nonce for the user's address
  // Some wallets reject transactions with wrong nonce (even for sponsored txs)
  let nonce = 0n;
  try {
    const nonceRes = await fetch(
      `https://api.mainnet.hiro.so/v2/accounts/${params.userAddress}?proof=0`
    );
    if (nonceRes.ok) {
      const accountData = await nonceRes.json();
      nonce = BigInt(accountData.nonce ?? 0);
      console.log('Fetched nonce:', nonce.toString());
    }
  } catch (e) {
    console.warn('Failed to fetch nonce, using 0:', e);
  }

  const network = await getNetworkInstance();
  console.log('Building sponsored tx, network:', network?.chainId);

  const transaction = await makeUnsignedContractCall({
    contractAddress: swapTx.contractAddress,
    contractName: swapTx.contractName,
    functionName: swapTx.functionName,
    functionArgs: swapTx.functionArgs,
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
    network: network,
    sponsored: true,
    publicKey,
    fee: 0n,
    nonce,
    validateWithAbi: false,
  });

  const txHex = transaction.serialize();
  console.log('Built sponsored tx, length:', txHex.length, 'starts with:', txHex.slice(0, 8));

  // Step 6: Wallet signs WITHOUT broadcasting
  onProgress?.('Waiting for wallet signature...');
  let signedTxHex: string;
  try {
    const signResult = await request('stx_signTransaction', {
      transaction: txHex,
      broadcast: false,
    });
    signedTxHex = (signResult as any).transaction || (signResult as any).txHex;
    if (!signedTxHex) throw new Error('Wallet did not return signed tx hex');
    console.log('Wallet signed tx, length:', signedTxHex.length);
  } catch (err: any) {
    console.error('stx_signTransaction error:', err?.message, err?.code);
    if (err?.message?.toLowerCase().includes('cancel') || err?.code === 4001) {
      throw new Error('Swap cancelled by user');
    }
    throw err;
  }

  // Step 7: Relayer adds sponsor sig and broadcasts
  onProgress?.('Broadcasting via VelumX...');
  const result = await velumx.sponsor(signedTxHex, {
    feeToken: isDeveloperSponsored ? undefined : selectedFeeToken,
    feeAmount: isDeveloperSponsored ? '0' : feeAmount,
    network: config.stacksNetwork as 'mainnet' | 'testnet'
  });

  console.log('VelumX sponsor result:', result);
  return result.txid;
}
