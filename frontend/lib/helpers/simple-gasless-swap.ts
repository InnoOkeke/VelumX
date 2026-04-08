/**
 * Simple Gasless Swap Helper — Sponsored Transaction Flow
 *
 * Uses openContractCall with sponsored: true, but forces the Stacks wallet provider
 * (Leather/Xverse) by using approvedProviderIds to exclude non-Stacks wallets like Pelagus.
 *
 * Flow:
 *  1. ALEX SDK runSwap() → get contract call params
 *  2. openContractCall({ sponsored: true }) with Stacks-only provider
 *  3. onFinish receives txRaw — signed sponsored tx hex (NOT broadcast)
 *  4. VelumX relayer: sponsorTransaction() adds sponsor sig + broadcasts
 */

import { getConfig } from '../config';
import { getVelumXClient } from '../velumx';
import { getStacksConnect, getNetworkInstance } from '../stacks-loader';
import { AlexSDK } from 'alex-sdk';

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

  const connect = await getStacksConnect();
  const network = await getNetworkInstance();

  // Step 4: Force Stacks-only provider to prevent Pelagus from intercepting.
  // Pelagus is a Quai Network wallet that intercepts openContractCall but ignores
  // sponsored: true, building a Standard tx and broadcasting it directly.
  // We select the previously-connected Stacks provider explicitly.
  try {
    const { setSelectedProviderId, getLocalStorage } = await import('@stacks/connect');
    const stored = getLocalStorage?.();
    // The selected provider ID is stored in localStorage by @stacks/connect
    const selectedId = (stored as any)?.selectedProviderId || '';
    console.log('Current selected provider:', selectedId);

    // If Pelagus is selected, clear it so the Stacks wallet modal shows
    if (selectedId && selectedId.toLowerCase().includes('pelagus')) {
      console.warn('Pelagus detected as selected provider — clearing to force Stacks wallet');
      const { clearSelectedProviderId } = await import('@stacks/connect');
      clearSelectedProviderId?.();
    }
  } catch (e) {
    console.warn('Provider check failed:', e);
  }

  // Step 5: openContractCall with sponsored: true
  // With the correct Stacks provider (Xverse/Leather), this reliably:
  //   - Shows the confirmation popup
  //   - Builds a sponsored tx (AuthType.Sponsored)
  //   - Returns txRaw in onFinish WITHOUT broadcasting
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
        console.log('Wallet onFinish keys:', Object.keys(data));
        console.log('Has txRaw:', !!data.txRaw, '| Has txid:', !!(data.txId || data.txid));

        const txRaw = data.txRaw;

        if (!txRaw) {
          // Wallet broadcast directly (sponsored flag ignored)
          const txid = data.txId || data.txid;
          if (txid) {
            console.warn('Wallet broadcast directly — user paid fee. txid:', txid);
            return resolve(txid);
          }
          return reject(new Error('No transaction data returned from wallet'));
        }

        // Step 6: Relayer adds sponsor signature and broadcasts
        onProgress?.('Broadcasting via VelumX...');
        try {
          const result = await velumx.sponsor(txRaw, {
            feeToken: isDeveloperSponsored ? undefined : selectedFeeToken,
            feeAmount: isDeveloperSponsored ? '0' : feeAmount,
            network: config.stacksNetwork as 'mainnet' | 'testnet'
          });
          console.log('VelumX sponsor result:', result);
          resolve(result.txid);
        } catch (err) {
          console.error('Relayer sponsor error:', err);
          reject(err);
        }
      },
      onCancel: () => reject(new Error('Swap cancelled by user'))
    });
  });
}
