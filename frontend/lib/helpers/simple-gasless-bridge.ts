/**
 * Simple Gasless Bridge Helper
 *
 * Uses VelumXClient (v3) + @stacks/connect to execute gasless Stacks → Ethereum bridge.
 *
 * Flow:
 *   1. Estimate fee in user's chosen SIP-010 token via VelumX relayer
 *   2. Build the burn/bridge transaction with sponsored: true
 *   3. User signs — wallet produces a raw tx hex
 *   4. VelumX relayer sponsors the STX fee and broadcasts
 */

import { getStacksConnect, getNetworkInstance } from '../stacks-loader';
import { Cl, PostConditionMode } from '@stacks/transactions';
import { getConfig } from '../config';
import { parseUnits } from 'viem';
import { getVelumXClient } from '../velumx';

export interface SimpleGaslessBridgeParams {
  userAddress: string;
  amount: string;           // Human-readable amount e.g. "10.5"
  recipientAddress: string; // Ethereum address
  onProgress?: (step: string) => void;
}

export async function executeSimpleGaslessBridge(params: SimpleGaslessBridgeParams): Promise<string> {
  const { amount, recipientAddress, onProgress } = params;
  const config = getConfig();
  const velumx = getVelumXClient();

  const amountInMicro = parseUnits(amount, 6);

  // Step 1: Estimate fee
  onProgress?.('Calculating fees...');
  const estimate = await velumx.estimateFee({
    feeToken: config.stacksUsdcxAddress,
    estimatedGas: 150000
  });

  const feeAmount = estimate.maxFee || '0';
  const isDeveloperSponsored = estimate.policy === 'DEVELOPER_SPONSORS';

  console.log('VelumX Gasless Bridge:', {
    amount,
    recipientAddress,
    feeToken: config.stacksUsdcxAddress,
    feeAmount,
    policy: estimate.policy
  });

  if (!config.velumxRelayerAddress) {
    throw new Error(
      'VelumX Configuration Error: NEXT_PUBLIC_VELUMX_RELAYER_ADDRESS is not set.'
    );
  }

  // Step 2: Build the bridge transaction
  onProgress?.('Preparing transaction...');

  const connect = await getStacksConnect();
  const network = await getNetworkInstance();

  const recipientBytes = encodeEthereumAddress(recipientAddress);
  const [contractAddress, contractName] = config.stacksUsdcxProtocolAddress.split('.');
  const [feeTokenAddress, feeTokenName] = config.stacksUsdcxAddress.split('.');

  // Step 3: User signs with sponsored: true
  return new Promise<string>((resolve, reject) => {
    connect.openContractCall({
      contractAddress,
      contractName,
      functionName: 'burn',
      functionArgs: [
        Cl.uint(amountInMicro.toString()),
        Cl.uint('0'), // native-domain: 0 for Ethereum
        Cl.buffer(recipientBytes),
      ],
      network,
      sponsored: true,
      postConditionMode: PostConditionMode.Allow,
      onFinish: async (data: any) => {
        console.log('Bridge signed:', data);
        onProgress?.('Broadcasting via VelumX...');

        try {
          const txRaw = data.txRaw || data.txHex;
          if (!txRaw) {
            const txid = data.txId || data.txid;
            if (txid) return resolve(txid);
            return reject(new Error('No transaction data returned from wallet'));
          }

          // Step 4: VelumX sponsors the STX fee
          const result = await velumx.sponsor(txRaw, {
            feeToken: isDeveloperSponsored ? undefined : config.stacksUsdcxAddress,
            feeAmount: isDeveloperSponsored ? '0' : feeAmount,
            network: config.stacksNetwork as 'mainnet' | 'testnet'
          });

          console.log('VelumX bridge result:', result);
          resolve(result.txid);
        } catch (error) {
          console.error('Bridge broadcast error:', error);
          reject(error);
        }
      },
      onCancel: () => reject(new Error('Bridge cancelled by user'))
    });
  });
}

function encodeEthereumAddress(address: string): Uint8Array {
  const hex = address.startsWith('0x') ? address.slice(2) : address;
  const paddedHex = hex.padStart(64, '0');
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(paddedHex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
