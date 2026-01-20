/**
 * Transaction Monitor Service
 * Monitors bridge transactions and processes attestations
 */

import fs from 'fs/promises';
import path from 'path';
import { BridgeTransaction, TransactionStatus } from '@shared/types';
import { getConfig } from '../config';
import { logger } from '../utils/logger';
import { attestationService } from './AttestationService';
import { stacksMintService } from './StacksMintService';

const QUEUE_FILE = path.join(process.cwd(), 'data', 'transaction-queue.json');

export class TransactionMonitorService {
  private config = getConfig();
  private queue: Map<string, BridgeTransaction> = new Map();
  private isMonitoring = false;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.ensureDataDirectory();
  }

  /**
   * Initializes the service and restores queue from disk
   */
  async initialize(): Promise<void> {
    logger.info('Initializing TransactionMonitorService');
    
    try {
      await this.restoreQueue();
      logger.info('Transaction queue restored', { queueSize: this.queue.size });
    } catch (error) {
      logger.error('Failed to restore transaction queue', { error });
      // Continue with empty queue
    }
  }

  /**
   * Starts monitoring transactions
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      logger.warn('Transaction monitoring already running');
      return;
    }

    this.isMonitoring = true;
    logger.info('Starting transaction monitoring');

    // Monitor every 30 seconds
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.processQueue();
      } catch (error) {
        logger.error('Error processing transaction queue', { error });
      }
    }, this.config.attestationPollInterval);

    // Process immediately
    await this.processQueue();
  }

  /**
   * Stops monitoring transactions
   */
  async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    // Persist queue before stopping
    await this.persistQueue();
    
    logger.info('Transaction monitoring stopped');
  }

  /**
   * Adds a transaction to the monitoring queue
   */
  async addTransaction(transaction: BridgeTransaction): Promise<void> {
    logger.info('Adding transaction to monitoring queue', {
      id: transaction.id,
      type: transaction.type,
      status: transaction.status,
    });

    this.queue.set(transaction.id, transaction);
    await this.persistQueue();
  }

  /**
   * Gets a transaction by ID
   */
  getTransaction(id: string): BridgeTransaction | undefined {
    return this.queue.get(id);
  }

  /**
   * Gets all transactions for a user
   */
  getUserTransactions(address: string): BridgeTransaction[] {
    const transactions: BridgeTransaction[] = [];
    
    for (const tx of this.queue.values()) {
      if (tx.ethereumAddress.toLowerCase() === address.toLowerCase() ||
          tx.stacksAddress === address) {
        transactions.push(tx);
      }
    }

    return transactions.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Gets all transactions
   */
  getAllTransactions(): BridgeTransaction[] {
    return Array.from(this.queue.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Updates transaction status
   */
  private async updateTransaction(
    id: string,
    updates: Partial<BridgeTransaction>
  ): Promise<void> {
    const tx = this.queue.get(id);
    if (!tx) {
      logger.warn('Transaction not found for update', { id });
      return;
    }

    const updatedTx: BridgeTransaction = {
      ...tx,
      ...updates,
      updatedAt: Date.now(),
    };

    this.queue.set(id, updatedTx);
    await this.persistQueue();

    logger.info('Transaction updated', {
      id,
      status: updatedTx.status,
      currentStep: updatedTx.currentStep,
    });
  }

  /**
   * Processes the transaction queue
   */
  private async processQueue(): Promise<void> {
    const pendingTransactions = Array.from(this.queue.values()).filter(
      tx => tx.status !== 'complete' && tx.status !== 'failed'
    );

    if (pendingTransactions.length === 0) {
      return;
    }

    logger.debug('Processing transaction queue', {
      pendingCount: pendingTransactions.length,
    });

    for (const tx of pendingTransactions) {
      try {
        if (tx.type === 'deposit') {
          await this.processDeposit(tx);
        } else {
          await this.processWithdrawal(tx);
        }
      } catch (error) {
        logger.error('Error processing transaction', {
          id: tx.id,
          type: tx.type,
          error: (error as Error).message,
        });

        // Increment retry count
        const retryCount = tx.retryCount + 1;
        
        if (retryCount >= this.config.maxRetries) {
          // Mark as failed after max retries
          await this.updateTransaction(tx.id, {
            status: 'failed',
            error: `Failed after ${retryCount} attempts: ${(error as Error).message}`,
            retryCount,
          });
        } else {
          // Update retry count
          await this.updateTransaction(tx.id, {
            retryCount,
            error: (error as Error).message,
          });
        }
      }
    }
  }

  /**
   * Processes a deposit transaction (Ethereum → Stacks)
   */
  private async processDeposit(tx: BridgeTransaction): Promise<void> {
    // Check timeout
    if (Date.now() - tx.createdAt > this.config.transactionTimeout) {
      logger.warn('Deposit transaction timeout', {
        id: tx.id,
        age: Date.now() - tx.createdAt,
      });
      
      await this.updateTransaction(tx.id, {
        status: 'failed',
        error: 'Transaction timeout',
      });
      return;
    }

    // State machine for deposit flow
    switch (tx.status) {
      case 'pending':
      case 'confirming':
        // Check if we have a message hash
        if (!tx.messageHash) {
          logger.error('Missing message hash for deposit', { id: tx.id });
          await this.updateTransaction(tx.id, {
            status: 'failed',
            error: 'Missing message hash from Ethereum deposit',
          });
          return;
        }

        // Move to attesting state
        await this.updateTransaction(tx.id, {
          status: 'attesting',
          currentStep: 'attestation',
        });
        break;

      case 'attesting':
        // Fetch attestation from Circle
        if (!tx.messageHash) {
          logger.error('Missing message hash for attestation', { id: tx.id });
          return;
        }

        try {
          const attestation = await attestationService.fetchCircleAttestation(
            tx.messageHash,
            { maxRetries: 1 } // Single attempt per monitoring cycle
          );

          await this.updateTransaction(tx.id, {
            attestation: attestation.attestation,
            attestationFetchedAt: attestation.fetchedAt,
            status: 'minting',
            currentStep: 'mint',
          });
        } catch (error) {
          // Attestation not ready yet, will retry next cycle
          logger.debug('Attestation not ready', { id: tx.id });
        }
        break;

      case 'minting':
        // Submit mint transaction to Stacks
        if (!tx.attestation || !tx.messageHash) {
          logger.error('Missing attestation or message hash for minting', { id: tx.id });
          return;
        }

        try {
          // Validate relayer balance first
          const hasBalance = await stacksMintService.validateRelayerBalance();
          if (!hasBalance) {
            logger.error('Insufficient relayer balance for minting', { id: tx.id });
            await this.updateTransaction(tx.id, {
              error: 'Insufficient relayer STX balance',
            });
            return;
          }

          // Mint USDCx on Stacks
          const mintTxId = await stacksMintService.mintUsdcx(
            tx.stacksAddress,
            tx.amount,
            tx.attestation,
            tx.messageHash
          );

          logger.info('Mint transaction submitted', {
            id: tx.id,
            mintTxId,
          });

          await this.updateTransaction(tx.id, {
            destinationTxHash: mintTxId,
            status: 'complete',
            completedAt: Date.now(),
          });
        } catch (error) {
          logger.error('Failed to mint USDCx', {
            id: tx.id,
            error: (error as Error).message,
          });
          throw error; // Will be caught by processQueue and increment retry count
        }
        break;
    }
  }

  /**
   * Processes a withdrawal transaction (Stacks → Ethereum)
   */
  private async processWithdrawal(tx: BridgeTransaction): Promise<void> {
    // Check timeout
    if (Date.now() - tx.createdAt > this.config.transactionTimeout) {
      logger.warn('Withdrawal transaction timeout', {
        id: tx.id,
        age: Date.now() - tx.createdAt,
      });
      
      await this.updateTransaction(tx.id, {
        status: 'failed',
        error: 'Transaction timeout',
      });
      return;
    }

    // State machine for withdrawal flow
    switch (tx.status) {
      case 'pending':
      case 'confirming':
        // Wait for Stacks confirmation
        // TODO: Check Stacks transaction status
        // For now, move to attesting state
        await this.updateTransaction(tx.id, {
          status: 'attesting',
          currentStep: 'attestation',
        });
        break;

      case 'attesting':
        // Fetch attestation from Stacks
        try {
          const attestation = await attestationService.fetchStacksAttestation(
            tx.sourceTxHash,
            { maxRetries: 1 } // Single attempt per monitoring cycle
          );

          await this.updateTransaction(tx.id, {
            attestation: attestation.attestation,
            messageHash: attestation.messageHash,
            attestationFetchedAt: attestation.fetchedAt,
            status: 'minting',
            currentStep: 'withdrawal',
          });
        } catch (error) {
          // Attestation not ready yet, will retry next cycle
          logger.debug('Attestation not ready', { id: tx.id });
        }
        break;

      case 'minting':
        // Submit withdrawal transaction to Ethereum
        // TODO: Implement Ethereum withdrawal transaction
        // For now, mark as complete
        await this.updateTransaction(tx.id, {
          status: 'complete',
          completedAt: Date.now(),
        });
        break;
    }
  }

  /**
   * Persists the queue to disk
   */
  private async persistQueue(): Promise<void> {
    try {
      const data = JSON.stringify(
        Array.from(this.queue.entries()),
        null,
        2
      );
      await fs.writeFile(QUEUE_FILE, data, 'utf-8');
      logger.debug('Transaction queue persisted', { queueSize: this.queue.size });
    } catch (error) {
      logger.error('Failed to persist transaction queue', { error });
    }
  }

  /**
   * Restores the queue from disk
   */
  private async restoreQueue(): Promise<void> {
    try {
      const data = await fs.readFile(QUEUE_FILE, 'utf-8');
      const entries: [string, BridgeTransaction][] = JSON.parse(data);
      this.queue = new Map(entries);
      logger.info('Transaction queue restored from disk', {
        queueSize: this.queue.size,
      });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet, start with empty queue
        logger.info('No existing queue file, starting with empty queue');
      } else {
        throw error;
      }
    }
  }

  /**
   * Ensures data directory exists
   */
  private async ensureDataDirectory(): Promise<void> {
    const dataDir = path.dirname(QUEUE_FILE);
    try {
      await fs.mkdir(dataDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create data directory', { error });
    }
  }
}

// Export singleton instance
export const transactionMonitorService = new TransactionMonitorService();
