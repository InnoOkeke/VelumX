/**
 * Gasless Transaction Service
 * Unified service for executing gasless transactions via VelumX SDK
 */

import { getStacksTransactions, getStacksConnect, getStacksCommon } from '../stacks-loader';
import { getVelumXClient } from '../velumx';
import { getSmartWalletManager } from './SmartWalletManager';
import { getFundConsolidator } from './FundConsolidator';
import { bytesToHex } from '../utils/address-encoding';
import { parseUnits } from 'viem';

export interface GaslessTransactionParams {
  userAddress: string;
  targetContract: string; // e.g., "ST...ADMIN.paymaster-module-v10"
  payload: any; // Clarity tuple CV
  estimatedFeeUsdcx: string; // e.g., "0.25"
  onProgress?: (status: string) => void;
}

export interface GaslessTransactionResult {
  txid: string;
  smartWalletAddress: string;
}

export class GaslessTransactionService {
  /**
   * Execute a gasless transaction with automatic Smart Wallet and fund management
   */
  async executeGaslessTransaction(
    params: GaslessTransactionParams
  ): Promise<GaslessTransactionResult> {
    const { userAddress, targetContract, payload, estimatedFeeUsdcx, onProgress } = params;

    try {
      // Step 1: Ensure Smart Wallet exists
      onProgress?.('Checking Smart Wallet...');
      const smartWalletManager = getSmartWalletManager();
      const smartWalletAddress = await smartWalletManager.ensureSmartWallet(userAddress, onProgress);

      // Step 2: Calculate total required amount
      const feeMicro = parseUnits(estimatedFeeUsdcx, 6);
      
      // Step 3: Ensure Smart Wallet has sufficient funds
      onProgress?.('Checking funds...');
      const fundConsolidator = getFundConsolidator();
      await fundConsolidator.ensureFunds(userAddress, smartWalletAddress, feeMicro, onProgress);

      // Step 4: Get current nonce
      onProgress?.('Preparing transaction...');
      const currentNonce = await smartWalletManager.getSmartWalletNonce(smartWalletAddress);

      // Step 5: Serialize payload
      const { serializeCV } = await getStacksTransactions();
      const serializedPayload = serializeCV(payload) as any;

      const payloadBytes: Uint8Array = typeof serializedPayload === 'string'
        ? (await getStacksCommon()).hexToBytes(
            serializedPayload.startsWith('0x') ? serializedPayload.slice(2) : serializedPayload
          )
        : serializedPayload;

      const payloadHex: string = typeof serializedPayload === 'string'
        ? serializedPayload
        : bytesToHex(serializedPayload);

      // Step 6: Create intent
      const intent = {
        target: targetContract,
        payload: payloadHex,
        maxFeeUSDCx: feeMicro.toString(),
        nonce: currentNonce,
      };

      console.log('VelumX Gasless Transaction Intent:', intent);

      // Step 7: Sign with SIP-018
      onProgress?.('Waiting for signature...');
      const signature = await this.signSIP018Intent(intent, payloadBytes);

      if (!signature) {
        throw new Error('Transaction signature was cancelled');
      }

      const signedIntent = {
        ...intent,
        signature,
      };

      // Step 8: Submit to relayer
      onProgress?.('Submitting to relayer...');
      const velumx = getVelumXClient();
      const result = await velumx.submitIntent(signedIntent);

      onProgress?.('Transaction submitted!');

      return {
        txid: result.txid,
        smartWalletAddress,
      };
    } catch (error) {
      console.error('Gasless transaction error:', error);
      throw error;
    }
  }

  /**
   * Sign intent using SIP-018 structured data signing
   */
  private async signSIP018Intent(intent: any, payloadBytes: Uint8Array): Promise<string | null> {
    const { tupleCV, stringAsciiCV, uintCV, principalCV, bufferCV } = await getStacksTransactions();
    const connectLib = await getStacksConnect();

    const domainCV = tupleCV({
      name: stringAsciiCV('VelumX-Smart-Wallet'),
      version: stringAsciiCV('1.0.0'),
      'chain-id': uintCV(2147483648),
    });

    const messageCV = tupleCV({
      target: principalCV(intent.target),
      payload: bufferCV(payloadBytes),
      'max-fee-usdcx': uintCV(intent.maxFeeUSDCx),
      nonce: uintCV(intent.nonce),
    });

    if (!connectLib || !connectLib.showSignStructuredMessage) {
      throw new Error('Stacks Connect not available');
    }

    return new Promise<string | null>((resolve, reject) => {
      connectLib.showSignStructuredMessage({
        domain: domainCV,
        message: messageCV,
        onFinish: (data: any) => {
          const sig = data.signature || data.result?.signature || data;
          resolve(sig);
        },
        onCancel: () => {
          resolve(null);
        },
      });
    });
  }

  /**
   * Estimate fee for a gasless transaction
   */
  async estimateFee(estimatedGas: number = 100000): Promise<{ maxFeeUSDCx: string; estimatedGas: number }> {
    try {
      const velumx = getVelumXClient();
      const estimate = await velumx.estimateFee({ estimatedGas });

      if (estimate && estimate.maxFeeUSDCx) {
        return {
          maxFeeUSDCx: estimate.maxFeeUSDCx,
          estimatedGas: estimate.estimatedGas || estimatedGas
        };
      }

      // Fallback
      return {
        maxFeeUSDCx: '250000', // 0.25 USDCx
        estimatedGas
      };
    } catch (error) {
      console.error('Fee estimation error:', error);
      return {
        maxFeeUSDCx: '250000',
        estimatedGas
      };
    }
  }
}

// Singleton instance
let instance: GaslessTransactionService | null = null;

export function getGaslessTransactionService(): GaslessTransactionService {
  if (!instance) {
    instance = new GaslessTransactionService();
  }
  return instance;
}
