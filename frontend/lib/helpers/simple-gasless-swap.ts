/**
 * Simple Gasless Swap Helper
 *
 * Flow:
 *  1. Use ALEX SDK to get swap tx params (runSwap returns params, does NOT open wallet)
 *  2. Call openContractCall ONCE with sponsored: true — opens the Stacks wallet
 *  3. Receive txRaw (user-signed sponsored tx hex) in onFinish
 *  4. Send txRaw to VelumX relayer — relayer adds sponsor sig and broadcasts
 *
 * Key notes:
 *  - ALEX SDK uses 1e8 (8 decimals) internally for all amounts
 *  - Token IDs must be ALEX internal IDs (e.g. 'token-wstx'), not contract addresses
 *  - sponsored: true tells the wallet to sign but NOT broadcast
 */

import { getConfig } from '../config';
import { getVelumXClient } from '../velumx';
import { getStacksConnect, getNetworkInstance } from '../stacks-loader';
import { AlexSDK } from 'alex-sdk';

export interface SimpleGaslessSwapParams {
  userAddress: string;
  tokenIn: string;       // contract address or ALEX token ID
  tokenOut: string;      // contract address or ALEX token ID
  amountIn: string;      // micro units in the token's native decimals
  minOut: string;        // micro units in the token's native decimals
  tokenInDecimals?: number;   // defaults to 6
  tokenOutDecimals?: number;  // defaults to 6
  feeToken?: string;
  onProgress?: (step: string) => void;
}

// ALEX SDK uses 1e8 internally — convert from token micro units to ALEX micro units
function toAlexAmount(microUnits: string, tokenDecimals: number): bigint {
  const ALEX_DECIMALS = 8;
  const human = Number(microUnits) / Math.pow(10, tokenDecimals);
  return BigInt(Math.floor(human * Math.pow(10, ALEX_DECIMALS)));
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

  // Step 1: Estimate fee
  onProgress?.('Calculating fees...');
  const estimate = await velumx.estimateFee({
    feeToken: selectedFeeToken,
    estimatedGas: 150000
  });

  const feeAmount = estimate.maxFee || '0';
  const isDeveloperSponsored = estimate.policy === 'DEVELOPER_SPONSORS';

  console.log('VelumX Gasless Swap:', {
    tokenIn, tokenOut, amountIn, minOut,
    feeToken: selectedFeeToken, feeAmount, policy: estimate.policy
  });

  // Step 2: Resolve ALEX internal currency IDs
  // ALEX SDK requires its own internal IDs (e.g. 'token-wstx', 'age000-governance-token')
  // not raw contract addresses
  onProgress?.('Preparing transaction...');
  const alex = new AlexSDK();

  const resolveAlexId = async (token: string): Promise<string> => {
    if (token === 'token-wstx' || token === 'STX') return 'token-wstx';

    // Already an ALEX internal ID (no dots, no SP prefix)
    if (!token.includes('.') && !token.startsWith('SP') && !token.startsWith('ST')) {
      return token;
    }

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

    throw new Error(`Token not supported by ALEX: ${token}. Check that the token is listed on ALEX DEX.`);
  };

  const alexTokenIn = await resolveAlexId(tokenIn) as any;
  const alexTokenOut = await resolveAlexId(tokenOut) as any;

  // Step 3: Convert amounts to ALEX's 1e8 decimal format
  const alexAmountIn = toAlexAmount(amountIn, tokenInDecimals);
  const alexMinOut = toAlexAmount(minOut, tokenOutDecimals);

  console.log('ALEX swap params:', {
    alexTokenIn, alexTokenOut,
    alexAmountIn: alexAmountIn.toString(),
    alexMinOut: alexMinOut.toString()
  });

  // Step 4: Get swap tx params from ALEX SDK
  // runSwap() returns { contractAddress, contractName, functionName, functionArgs, postConditions }
  // It does NOT open the wallet — we do that ourselves below with openContractCall
  const swapTx = await alex.runSwap(
    params.userAddress,
    alexTokenIn,
    alexTokenOut,
    alexAmountIn,
    alexMinOut
  );

  const connect = await getStacksConnect();
  const network = await getNetworkInstance();

  // Step 5: Open the Stacks wallet ONCE with sponsored: true
  // The wallet signs the tx but does NOT broadcast it.
  // onFinish receives txRaw — the user-signed sponsored tx hex ready for the relayer.
  return new Promise<string>((resolve, reject) => {
    connect.openContractCall({
      ...swapTx,
      network,
      sponsored: true,
      onFinish: async (data: any) => {
        console.log('Swap signed by wallet:', data);
        onProgress?.('Broadcasting via VelumX...');

        try {
          // txRaw is the user-signed sponsored tx hex (not yet broadcast)
          const txRaw = data.txRaw || data.txHex;

          if (!txRaw) {
            // Wallet broadcast it directly (non-sponsored fallback)
            const txid = data.txId || data.txid;
            if (txid) return resolve(txid);
            return reject(new Error('No transaction data returned from wallet'));
          }

          // Step 6: VelumX relayer adds sponsor signature and broadcasts
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
