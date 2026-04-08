/**
 * Simple Gasless Swap Helper
 *
 * DEVELOPER_SPONSORS flow (unchanged):
 *   - Build unsigned swap tx directly on ALEX AMM
 *   - Wallet signs via stx_signTransaction (no broadcast)
 *   - Relayer co-signs + broadcasts (pays STX fee)
 *   - User pays nothing
 *
 * USER_PAYS flow (new - uses simple-paymaster-v1):
 *   - Build unsigned tx calling swap-gasless on the paymaster contract
 *   - swap-gasless collects the fee token AND executes the ALEX swap atomically
 *   - Wallet signs via stx_signTransaction (no broadcast)
 *   - Relayer co-signs + broadcasts (pays STX fee, gets reimbursed in fee token)
 */

import { getConfig } from '../config';
import { getVelumXClient } from '../velumx';
import { AlexSDK } from 'alex-sdk';
import { request } from '@stacks/connect';
import {
  makeUnsignedContractCall,
  PostConditionMode,
  Cl,
  principalCV,
  uintCV,
  someCV,
  noneCV,
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
    } catch (e) { console.warn('stx_getAddresses failed:', e); }
  }
  if (!publicKey) throw new Error('Wallet public key not available. Please reconnect your wallet.');

  // Step 5: Fetch nonce
  let nonce = 0n;
  try {
    const nonceRes = await fetch(`https://api.mainnet.hiro.so/v2/accounts/${params.userAddress}?proof=0`);
    if (nonceRes.ok) {
      const accountData = await nonceRes.json();
      nonce = BigInt(accountData.nonce ?? 0);
    }
  } catch (e) { console.warn('Failed to fetch nonce:', e); }

  // Step 6: Build the unsigned sponsored tx
  // DEVELOPER_SPONSORS: call ALEX swap directly (relayer pays STX, user pays nothing)
  // USER_PAYS: call swap-gasless on paymaster (fee collected + swap executed atomically)
  let contractAddress: string;
  let contractName: string;
  let functionName: string;
  let functionArgs: any[];

  if (isDeveloperSponsored) {
    // Direct ALEX swap — relayer sponsors STX, no token fee
    contractAddress = swapTx.contractAddress;
    contractName = swapTx.contractName;
    functionName = swapTx.functionName;
    functionArgs = swapTx.functionArgs;
  } else {
    // Paymaster swap — fee collected in feeToken + ALEX swap executed atomically
    // swap-gasless(token-x-trait, token-y-trait, factor, dx, min-dy, fee-amount, relayer, fee-token)
    const paymasterAddress = (estimate as any).paymasterAddress || config.stacksPaymasterAddress;
    if (!paymasterAddress) throw new Error('Paymaster address not available from relayer');
    const [pmContract, pmName] = paymasterAddress.split('.');
    contractAddress = pmContract;
    contractName = pmName;
    functionName = 'swap-gasless';

    // Get relayer address from the estimate response or derive it
    // The relayer address is returned by the /estimate endpoint
    const relayerAddress = (estimate as any).relayerAddress || config.velumxRelayerAddress;
    if (!relayerAddress) throw new Error('Relayer address not available');

    // Parse ALEX factor from the swap tx args (index 2 in swap-helper)
    // swap-helper(token-x-trait, token-y-trait, factor, dx, min-dy)
    const alexFactor = swapTx.functionArgs[2]; // factor uint
    const alexDx = swapTx.functionArgs[3];     // dx uint
    const alexMinDy = swapTx.functionArgs[4];  // min-dy (optional uint)

    // Parse token contract addresses from ALEX swap tx
    const [tokenXAddress, tokenXName] = tokenIn === 'token-wstx'
      ? ['SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM', 'token-wstx-v2']
      : tokenIn.split('.');
    const [tokenYAddress, tokenYName] = tokenOut === 'token-wstx'
      ? ['SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM', 'token-wstx-v2']
      : tokenOut.split('.');
    const [feeTokenAddress, feeTokenName] = selectedFeeToken.split('.');

    functionArgs = [
      Cl.contractPrincipal(tokenXAddress, tokenXName),  // token-x-trait
      Cl.contractPrincipal(tokenYAddress, tokenYName),  // token-y-trait
      alexFactor,                                        // factor
      alexDx,                                            // dx
      alexMinDy,                                         // min-dy (optional uint)
      uintCV(BigInt(feeAmount)),                         // fee-amount
      principalCV(relayerAddress),                       // relayer
      Cl.contractPrincipal(feeTokenAddress, feeTokenName), // fee-token
    ];
  }

  const transaction = await makeUnsignedContractCall({
    contractAddress,
    contractName,
    functionName,
    functionArgs,
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
    network: 'mainnet',
    sponsored: true,
    publicKey,
    fee: 0n,
    nonce,
    validateWithAbi: false,
  });

  const txHex = transaction.serialize();
  console.log('Built sponsored tx:', txHex.slice(0, 8), 'length:', txHex.length, isDeveloperSponsored ? '(direct swap)' : '(paymaster swap)');

  // Step 7: Wallet signs WITHOUT broadcasting
  onProgress?.('Waiting for wallet signature...');
  let signedTxHex: string;
  try {
    const signResult = await request('stx_signTransaction', {
      transaction: txHex,
      broadcast: false,
    });
    signedTxHex = (signResult as any).transaction || (signResult as any).txHex;
    if (!signedTxHex) throw new Error('Wallet did not return signed tx hex');
  } catch (err: any) {
    if (err?.message?.toLowerCase().includes('cancel') || err?.code === 4001) {
      throw new Error('Swap cancelled by user');
    }
    throw err;
  }

  // Step 8: Relayer co-signs + broadcasts
  onProgress?.('Broadcasting via VelumX...');
  const result = await velumx.sponsor(signedTxHex, {
    feeToken: isDeveloperSponsored ? undefined : selectedFeeToken,
    feeAmount: isDeveloperSponsored ? '0' : feeAmount,
    network: config.stacksNetwork as 'mainnet' | 'testnet'
  });

  console.log('VelumX sponsor result:', result);
  return result.txid;
}
