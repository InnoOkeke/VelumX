/**
 * Stacks Mint Service
 * Handles minting USDCx on Stacks after receiving attestations
 */

import {
  makeContractCall,
  broadcastTransaction,
  makeSTXTokenTransfer,
  AnchorMode,
  PostConditionMode,
  bufferCV,
  uintCV,
} from '@stacks/transactions';
import { STACKS_TESTNET, STACKS_MAINNET, StacksNetwork } from '@stacks/network';
import { getConfig } from '../config';
import { logger } from '../utils/logger';

export class StacksMintService {
  private config = getConfig();
  private network: StacksNetwork = STACKS_TESTNET;

  /**
   * Funds a new Stacks account if it has low balance
   * @param recipientAddress - Address to check and fund
   * @returns Transaction ID of funding transfer, or null if not needed
   */
  async fundNewAccount(recipientAddress: string): Promise<string | null> {
    try {
      // Check current balance
      const response = await fetch(
        `${this.config.stacksRpcUrl}/v2/accounts/${recipientAddress}?proof=0`
      );

      if (!response.ok) {
        // If 404, account likely doesn't exist, so definitely needs funding
        if (response.status !== 404) {
          throw new Error(`Failed to check account balance: ${response.statusText}`);
        }
      }

      const data = (response.ok ? await response.json() : { balance: '0' }) as { balance: string };
      const balance = BigInt(data.balance);
      const minBalance = BigInt(100000); // 0.1 STX

      // If balance is sufficient, skip
      if (balance >= minBalance) {
        logger.info('Account has sufficient STX, skipping gas drop', {
          address: recipientAddress,
          balance: balance.toString()
        });
        return null;
      }

      logger.info('Account needs funding, initiating gas drop', {
        address: recipientAddress,
        currentBalance: balance.toString()
      });

      const txOptions = {
        recipient: recipientAddress,
        amount: BigInt(500000), // 0.5 STX
        senderKey: this.config.relayerPrivateKey,
        network: this.network, // Use the stored network object
        memo: 'VelumX Gas Drop',
        anchorMode: AnchorMode.Any,
      };

      const transaction = await makeSTXTokenTransfer(txOptions);

      // Safety check
      if (!transaction) {
        throw new Error('Failed to create STX token transfer transaction');
      }

      const broadcastResponse = await broadcastTransaction({ transaction });

      if ('error' in broadcastResponse) {
        throw new Error(`Gas drop broadcast failed: ${broadcastResponse.error}`);
      }

      const txId = broadcastResponse.txid;
      logger.info('Gas drop successful', {
        address: recipientAddress,
        txId
      });

      return txId;
    } catch (error) {
      logger.error('Failed to process gas drop', {
        address: recipientAddress,
        error: (error as Error).message
      });
      return null;
    }
  }

  /**
   * Mints USDCx on Stacks using the attestation
   * 
   * @param recipientAddress - Stacks address to receive USDCx
   * @param amount - Amount in micro USDCx (6 decimals)
   * @param attestation - Attestation from Circle
   * @param messageHash - Message hash from Ethereum deposit
   * @returns Transaction ID
   */
  async mintUsdcx(
    recipientAddress: string,
    amount: string,
    attestation: string,
    messageHash: string
  ): Promise<string> {
    logger.info('Starting USDCx mint on Stacks', {
      recipient: recipientAddress,
      amount,
      messageHash,
    });

    try {
      // Parse contract address
      const [contractAddress, contractName] = this.config.stacksUsdcxProtocolAddress.split('.');

      if (!contractAddress || !contractName) {
        throw new Error('Invalid Stacks USDCx protocol address format');
      }

      // Convert attestation and message hash to buffers
      const attestationBuffer = Buffer.from(attestation.replace('0x', ''), 'hex');
      const messageHashBuffer = Buffer.from(messageHash.replace('0x', ''), 'hex');

      // Create contract call transaction
      const txOptions = {
        contractAddress,
        contractName,
        functionName: 'mint',
        functionArgs: [
          uintCV(amount),
          bufferCV(attestationBuffer),
          bufferCV(messageHashBuffer),
        ],
        senderKey: this.config.relayerPrivateKey,
        network: 'testnet' as const,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
        fee: BigInt(10000), // 0.01 STX fee
      };

      logger.debug('Creating mint transaction', {
        contractAddress,
        contractName,
        functionName: 'mint',
        amount,
      });

      const transaction = await makeContractCall(txOptions);

      // Broadcast transaction
      logger.debug('Broadcasting mint transaction');
      const broadcastResponse = await broadcastTransaction({ transaction });

      if ('error' in broadcastResponse) {
        throw new Error(`Broadcast failed: ${broadcastResponse.error} - ${broadcastResponse.reason}`);
      }

      const txId = broadcastResponse.txid;
      logger.info('USDCx mint transaction broadcast successfully', {
        txId,
        recipient: recipientAddress,
        amount,
      });

      return txId;
    } catch (error) {
      logger.error('Failed to mint USDCx on Stacks', {
        recipient: recipientAddress,
        amount,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Checks if a Stacks transaction has been confirmed
   * 
   * @param txId - Transaction ID to check
   * @returns Transaction status
   */
  async checkTransactionStatus(txId: string): Promise<{
    status: 'pending' | 'success' | 'failed';
    blockHeight?: number;
  }> {
    try {
      const response = await fetch(
        `${this.config.stacksRpcUrl}/extended/v1/tx/${txId}`
      );

      if (!response.ok) {
        if (response.status === 404) {
          return { status: 'pending' };
        }
        throw new Error(`Failed to fetch transaction: ${response.statusText}`);
      }

      const data: any = await response.json();

      if (data.tx_status === 'success') {
        return {
          status: 'success',
          blockHeight: data.block_height,
        };
      } else if (data.tx_status === 'abort_by_response' || data.tx_status === 'abort_by_post_condition') {
        return { status: 'failed' };
      }

      return { status: 'pending' };
    } catch (error) {
      logger.error('Failed to check transaction status', {
        txId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Validates that the relayer has sufficient STX balance
   */
  async validateRelayerBalance(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.config.stacksRpcUrl}/v2/accounts/${this.config.relayerStacksAddress}?proof=0`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch relayer balance: ${response.statusText}`);
      }

      const data: any = await response.json();
      const balance = BigInt(data.balance);

      if (balance < this.config.minStxBalance) {
        logger.warn('Relayer STX balance below minimum', {
          balance: balance.toString(),
          minimum: this.config.minStxBalance.toString(),
        });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Failed to validate relayer balance', {
        error: (error as Error).message,
      });
      return false;
    }
  }
}

// Export singleton instance
export const stacksMintService = new StacksMintService();
