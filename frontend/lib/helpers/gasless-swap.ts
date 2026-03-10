/**
 * Gasless Swap Helper
 * Simplified swap operations using VelumX SDK
 */

import { getGaslessTransactionService } from '@/lib/services/GaslessTransactionService';
import { tupleCV, Cl } from '@stacks/transactions';
import { getConfig } from '@/lib/config';
import { parseUnits } from 'viem';

export interface Token {
  symbol: string;
  address: string;
  decimals: number;
}

export interface GaslessSwapParams {
  userAddress: string;
  inputToken: Token;
  outputToken: Token;
  inputAmount: string;  // Human-readable format
  minOutputAmount: string;  // Human-readable format
  onProgress?: (step: string) => void;
}

/**
 * Execute gasless swap
 * User pays gas fees in USDCx automatically
 */
export async function executeGaslessSwap(params: GaslessSwapParams): Promise<string> {
  const { userAddress, inputToken, outputToken, inputAmount, minOutputAmount, onProgress } = params;
  const config = getConfig();
  const gaslessService = getGaslessTransactionService();
  
  // Convert amounts to micro units
  const amountInMicro = parseUnits(inputAmount, inputToken.decimals);
  const minAmountOutMicro = parseUnits(minOutputAmount, outputToken.decimals);
  
  // Get fee estimate
  onProgress?.('Calculating fees...');
  const estimate = await gaslessService.estimateFee(100000);
  const feeInMicro = BigInt(estimate.maxFeeUSDCx);
  
  console.log('Swap Details:', {
    inputToken: inputToken.symbol,
    outputToken: outputToken.symbol,
    amountIn: amountInMicro.toString(),
    minOut: minAmountOutMicro.toString(),
    fee: feeInMicro.toString()
  });
  
  // Determine swap function based on token types
  const isInputStx = inputToken.symbol === 'STX';
  const isOutputStx = outputToken.symbol === 'STX';
  
  let targetContract: string;
  let payload: any;
  
  if (isInputStx) {
    // STX -> Token swap
    targetContract = config.stacksPaymasterAddress;
    payload = tupleCV({
      tokenOut: Cl.principal(outputToken.address),
      amountIn: Cl.uint(amountInMicro.toString()),
      minOut: Cl.uint(minAmountOutMicro.toString()),
      fee: Cl.uint(feeInMicro.toString())
    });
  } else if (isOutputStx) {
    // Token -> STX swap
    targetContract = config.stacksPaymasterAddress;
    payload = tupleCV({
      tokenIn: Cl.principal(inputToken.address),
      amountIn: Cl.uint(amountInMicro.toString()),
      minOut: Cl.uint(minAmountOutMicro.toString()),
      fee: Cl.uint(feeInMicro.toString())
    });
  } else {
    // Token -> Token swap
    targetContract = config.stacksPaymasterAddress;
    payload = tupleCV({
      tokenIn: Cl.principal(inputToken.address),
      tokenOut: Cl.principal(outputToken.address),
      amountIn: Cl.uint(amountInMicro.toString()),
      minOut: Cl.uint(minAmountOutMicro.toString()),
      fee: Cl.uint(feeInMicro.toString())
    });
  }
  
  // Execute gasless transaction
  const result = await gaslessService.executeGaslessTransaction({
    userAddress,
    targetContract,
    payload,
    estimatedFeeUsdcx: (Number(feeInMicro) / 1_000_000).toString(),
    onProgress
  });
  
  return result.txid;
}

/**
 * Get total cost for swap (includes gas fee in USDCx)
 */
export async function getSwapTotalCost(inputAmount: string, inputDecimals: number): Promise<{
  swapAmount: bigint;
  fee: bigint;
  total: bigint;
  feeFormatted: string;
}> {
  const gaslessService = getGaslessTransactionService();
  const swapAmountInMicro = parseUnits(inputAmount, inputDecimals);
  
  const estimate = await gaslessService.estimateFee(100000);
  const feeInMicro = BigInt(estimate.maxFeeUSDCx);
  
  // Note: If input token is USDCx, total = swap + fee
  // Otherwise, fee is separate in USDCx
  
  return {
    swapAmount: swapAmountInMicro,
    fee: feeInMicro,
    total: swapAmountInMicro + feeInMicro,  // Only relevant if input is USDCx
    feeFormatted: (Number(feeInMicro) / 1_000_000).toFixed(6)
  };
}
