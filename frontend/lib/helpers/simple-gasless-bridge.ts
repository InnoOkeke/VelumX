/**
 * Simple Gasless Bridge Helper
 * Uses Stacks-native sponsored transactions with simple-paymaster-v1
 */

import { getStacksConnect, getNetworkInstance } from '../stacks-loader';
import { 
  Cl, 
  PostConditionMode 
} from '@stacks/transactions';
import { getConfig } from '../config';
import { parseUnits } from 'viem';
import { getVelumXClient } from '../velumx';

export interface SimpleGaslessBridgeParams {
  userAddress: string;
  amount: string;  // Amount in human-readable format (e.g., "10.5")
  recipientAddress: string;  // Ethereum address
  onProgress?: (step: string) => void;
}

/**
 * Execute gasless bridge withdrawal using simple-paymaster
 * User pays gas fees in USDCx, relayer sponsors STX
 */
export async function executeSimpleGaslessBridge(params: SimpleGaslessBridgeParams): Promise<string> {
  const { amount, recipientAddress, onProgress } = params;
  const config = getConfig();
  const velumx = getVelumXClient();

  // Convert amount to micro units (6 decimals)
  const amountInMicro = parseUnits(amount, 6);

  onProgress?.('Preparing transaction...');

  // Encode Ethereum address to bytes32
  const recipientBytes = encodeEthereumAddress(recipientAddress);

  // Get relayer address from config
  const relayerAddress = config.velumxRelayerAddress;

  // SAFETY LOCK: Block the transaction if the address is not configured
  if (!relayerAddress) {
    throw new Error('VelumX Configuration Error: Relayer Address is not set. Please add NEXT_PUBLIC_VELUMX_RELAYER_ADDRESS to your environment variables.');
  }

  const connect = await getStacksConnect();
  const network = await getNetworkInstance();

  // The 0.25 USDCx fee in micro-units
  const bridgeFeeInMicro = '250000';

  // Call bridge-gasless with sponsored=true
  const result = await new Promise<{ txid?: string; txRaw?: string } | null>((resolve, reject) => {
    const [paymasterAddress, paymasterName] = config.stacksPaymasterAddress.split('.');
    const [feeTokenAddress, feeTokenName] = config.stacksUsdcxAddress.split('.');

    // Encode the bridge action payload (bridge-tokens amount recipient)
    const payloadBuffer = Cl.serialize(Cl.tuple({
      amount: Cl.uint(amountInMicro.toString()),
      recipient: Cl.buffer(recipientBytes)
    }));

    connect.openContractCall({
      contractAddress: paymasterAddress,
      contractName: paymasterName,
      functionName: 'call-gasless',
      functionArgs: [
        Cl.contractPrincipal(feeTokenAddress, feeTokenName),
        Cl.uint(bridgeFeeInMicro),
        Cl.principal(relayerAddress),
        Cl.principal('SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE'), // Bridge Contract Address
        Cl.stringAscii('bridge-tokens'),
        Cl.buffer(payloadBuffer as any)
      ],
      network,
      postConditionMode: PostConditionMode.Allow,
      onFinish: (data: any) => {
        console.log('Bridge result received:', data);
        resolve({ txRaw: data.txRaw });
      },
      onCancel: () => {
        reject(new Error('Bridge initiation cancelled'));
      }
    });
  });

  if (!result) {
    throw new Error('Transaction was cancelled');
  }

  onProgress?.('Broadcasting via VelumX Relayer...');

  // Execute sponsorship broadcast via VelumX SDK
  // We pass the raw transaction for sponsorship and explicitly report the 0.25 USDCx fee
  if (result.txRaw) {
    const broadcastResult = await velumx.sponsor(result.txRaw, {
      feeAmount: bridgeFeeInMicro,
      feeToken: config.stacksUsdcxAddress,
      network: (network as any).isMainnet() ? 'mainnet' : 'testnet'
    } as any);
    console.log('Bridge broadcast result:', broadcastResult);
    return broadcastResult.txid;
  }

  // Fallback for immediate TXID (e.g. if already broadcasted by wallet)
  const txid = result.txid || (result as any).txId || (result as any).result?.txid;
  if (txid) {
    return txid;
  }

  throw new Error('No transaction ID returned from sponsorship');
}

/**
 * Encode Ethereum address to bytes32 for Stacks contract
 */
function encodeEthereumAddress(address: string): Uint8Array {
  const hex = address.startsWith('0x') ? address.slice(2) : address;
  const paddedHex = hex.padStart(64, '0');
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(paddedHex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
