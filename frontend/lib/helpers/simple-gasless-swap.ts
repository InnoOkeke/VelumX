/**
 * Simple Gasless Swap Helper
 * Uses Stacks-native sponsored transactions with simple-paymaster-v1
 * 
 * MULTI-TOKEN SUPPORT:
 * The paymaster accepts ANY SIP-010 token for fees via the <sip-010-trait> parameter.
 * To use a different token (e.g., sBTC, ALEX):
 * 1. Convert the fee estimate to the desired token's units
 * 2. Pass the token's contract address as the last parameter
 * 
 * Example with sBTC:
 *   Cl.principal('SM3KNVZS30WM7F89SXKVVFY4SN9RMPZZ9FX929N0V.sbtc')
 * 
 * Example with ALEX:
 *   Cl.principal('ALEX_TOKEN_ADDRESS')
 */

import { getStacksConnect, getNetworkInstance } from '../stacks-loader';
import { 
  Cl, 
  PostConditionMode 
} from '@stacks/transactions';
import { getConfig } from '../config';
import { parseUnits } from 'viem';
import { getVelumXClient } from '../velumx';

export interface SimpleGaslessSwapParams {
  userAddress: string;
  tokenIn: string;  // Token contract address (e.g., "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.token-wstx")
  tokenOut: string; // Token contract address
  amountIn: string; // Amount in human-readable format
  minOut: string;   // Minimum output amount
  feeToken?: string; // NEW: Universal Gas Token
  onProgress?: (step: string) => void;
}

/**
 * Execute gasless swap using universal-paymaster
 * User pays gas fees in any whitelisted SIP-010 token, relayer sponsors STX
 */
export async function executeSimpleGaslessSwap(params: SimpleGaslessSwapParams): Promise<string> {
  const { userAddress, tokenIn, tokenOut, amountIn, minOut, feeToken, onProgress } = params;
  const config = getConfig();
  const velumx = getVelumXClient();
  
  // Convert amounts to micro units (6 decimals)
  const amountInMicro = parseUnits(amountIn, 6);
  const minOutMicro = parseUnits(minOut, 6);
  
  // Get universal fee estimate
  onProgress?.('Calculating universal fees...');
  const selectedFeeToken = feeToken || config.stacksUsdcxAddress;
  
  // Cast to any or a local interface to support the new 'maxFee' field from the updated relayer
  const estimate = await velumx.estimateFee({ 
    estimatedGas: 150000,
    feeToken: selectedFeeToken 
  }) as any;
  
  const feeInMicro = BigInt((estimate as any).maxFee || 0);
  
  console.log('Universal Swap Details:', {
    tokenIn,
    tokenOut,
    amountIn: amountInMicro.toString(),
    feeToken: selectedFeeToken,
    fee: feeInMicro.toString()
  });
  
  // Get relayer address from config or default
  const relayerAddress = config.stacksPaymasterAddress.split('.')[0]; 
  
  onProgress?.('Preparing transaction...');
  
  const connect = await getStacksConnect();
  const network = await getNetworkInstance();
  
  // Use the new Universal Paymaster v1
  const result = await new Promise<{ txid?: string; txRaw?: string } | null>((resolve, reject) => {
    const [paymasterAddress, paymasterName] = config.stacksPaymasterAddress.split('.');
    const [feeTokenAddress, feeTokenName] = selectedFeeToken.split('.');

    // Encode the swap action payload (swap-v1 tokenIn tokenOut amountIn minOut)
    const payloadBuffer = Cl.serialize(Cl.tuple({
      tokenIn: Cl.principal(tokenIn),
      tokenOut: Cl.principal(tokenOut),
      amountIn: Cl.uint(amountIn),
      minOut: Cl.uint(minOut)
    }));

    connect.openContractCall({
      contractAddress: paymasterAddress,
      contractName: paymasterName,
      functionName: 'call-gasless',
      functionArgs: [
        Cl.contractPrincipal(feeTokenAddress, feeTokenName),
        Cl.uint(feeInMicro.toString()),
        Cl.principal(relayerAddress),
        Cl.principal(tokenIn.split('.')[0]), // Target Contract: The token's deployer or a specific router
        Cl.stringAscii('swap-v1'),
        Cl.buffer(payloadBuffer as any)
      ],
      network,
      postConditionMode: PostConditionMode.Allow,
      onFinish: (data: any) => {
        console.log('Swap result received:', data);
        resolve({ txRaw: data.txRaw });
      },
      onCancel: () => {
        reject(new Error('Swap initiation cancelled'));
      }
    });
  });

  if (!result) {
    throw new Error('Transaction was cancelled');
  }

  onProgress?.('Broadcasting transaction...');

  // If we have txRaw, broadcast it via relayer
  if (result.txRaw) {
    const broadcastResult = await velumx.sponsor(result.txRaw, { 
      feeAmount: feeInMicro.toString(),
      feeToken: selectedFeeToken,
      network: (network as any).isMainnet() ? 'mainnet' : 'testnet'
    } as any);
    console.log('Swap broadcast result:', broadcastResult);
    return broadcastResult.txid;
  }

  // Otherwise use the txid from the response
  const txid = result.txid || (result as any).txId || (result as any).result?.txid;
  if (txid) {
    return txid;
  }

  throw new Error('No transaction ID returned');
}
