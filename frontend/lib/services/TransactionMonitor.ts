/**
 * Transaction Monitor Service (Prisma Version)
 * Monitors bridge transactions and processes attestations
 */

import { BridgeTransaction, TransactionStatus } from '@shared/types';
import { getBackendConfig } from '../backend/config';
import { logger } from '../backend/logger';
import { attestationService } from './AttestationService';
import { stacksMintService } from './StacksMintService';
import prisma from '../prisma';

export class TransactionMonitorService {
    private config = getBackendConfig();

    /**
     * Adds a transaction to the monitoring queue (DB)
     */
    async addTransaction(transaction: Omit<BridgeTransaction, 'id' | 'createdAt' | 'updatedAt'>): Promise<BridgeTransaction> {
        logger.info('Adding transaction to DB', {
            type: transaction.type,
            status: transaction.status,
        });

        const dbTx = await prisma.bridgeTransaction.create({
            data: {
                ...transaction,
                retryCount: 0,
            } as any,
        });

        return dbTx as unknown as BridgeTransaction;
    }

    /**
     * Gets a transaction by ID
     */
    async getTransaction(id: string): Promise<BridgeTransaction | null> {
        const tx = await prisma.bridgeTransaction.findUnique({ where: { id } });
        return tx as unknown as BridgeTransaction | null;
    }

    /**
     * Gets all transactions for a user
     */
    async getUserTransactions(address: string): Promise<BridgeTransaction[]> {
        const lowerAddress = address.toLowerCase();
        const transactions = await prisma.bridgeTransaction.findMany({
            where: {
                OR: [
                    { ethereumAddress: { equals: lowerAddress, mode: 'insensitive' } },
                    { stacksAddress: address },
                ],
            },
            orderBy: { createdAt: 'desc' },
        });

        return transactions as unknown as BridgeTransaction[];
    }

    /**
     * Gets all transactions
     */
    async getAllTransactions(): Promise<BridgeTransaction[]> {
        const transactions = await prisma.bridgeTransaction.findMany({
            orderBy: { createdAt: 'desc' },
        });
        return transactions as unknown as BridgeTransaction[];
    }

    /**
     * Updates transaction status
     */
    async updateTransaction(
        id: string,
        updates: Partial<BridgeTransaction>
    ): Promise<void> {
        await prisma.bridgeTransaction.update({
            where: { id },
            data: updates as any,
        });

        logger.info('Transaction updated in DB', { id, status: updates.status });
    }

    /**
     * Processes the transaction queue (Called by Cron Job)
     */
    async processQueue(): Promise<void> {
        const pendingTransactions = await prisma.bridgeTransaction.findMany({
            where: {
                status: { notIn: ['complete', 'failed'] },
            },
        });

        if (pendingTransactions.length === 0) return;

        logger.info('Processing transaction queue', { pendingCount: pendingTransactions.length });

        for (const tx of pendingTransactions) {
            try {
                if (tx.type === 'deposit') {
                    await this.processDeposit(tx as any);
                } else if (tx.type === 'withdrawal') {
                    await this.processWithdrawal(tx as any);
                }
            } catch (error) {
                logger.error('Error processing transaction', { id: tx.id, error: (error as Error).message });
                const retryCount = tx.retryCount + 1;
                if (retryCount >= this.config.maxRetries) {
                    await this.updateTransaction(tx.id, {
                        status: 'failed',
                        error: `Failed after ${retryCount} attempts: ${(error as Error).message}`,
                        retryCount,
                    });
                } else {
                    await this.updateTransaction(tx.id, { retryCount, error: (error as Error).message });
                }
            }
        }
    }

    private isXReserveDeposit(tx: BridgeTransaction): boolean {
        return tx.sourceChain === 'ethereum' && tx.destinationChain === 'stacks' && tx.type === 'deposit';
    }

    private async checkEthereumConfirmation(txHash: string): Promise<boolean> {
        try {
            const response = await fetch(this.config.ethereumRpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'eth_getTransactionReceipt',
                    params: [txHash],
                    id: 1,
                }),
            });
            const data: any = await response.json();
            return data.result?.status === '0x1';
        } catch (error) {
            return false;
        }
    }

    private async processDeposit(tx: BridgeTransaction): Promise<void> {
        if (Date.now() - (tx.createdAt as any).getTime() > this.config.transactionTimeout) {
            await this.updateTransaction(tx.id, { status: 'failed', error: 'Transaction timeout' });
            return;
        }

        switch (tx.status) {
            case 'pending':
            case 'confirming':
                if (await this.checkEthereumConfirmation(tx.sourceTxHash)) {
                    try {
                        await stacksMintService.fundNewAccount(tx.stacksAddress);
                    } catch (e) {
                        logger.warn('Gas drop failed, proceeding...', { error: (e as Error).message });
                    }
                    await this.updateTransaction(tx.id, { status: 'attesting', currentStep: 'attestation' });
                }
                break;

            case 'attesting':
                if (this.isXReserveDeposit(tx)) {
                    try {
                        const att = await attestationService.fetchXReserveAttestation(tx.sourceTxHash, tx.stacksAddress, tx.amount);
                        await this.updateTransaction(tx.id, {
                            status: 'complete',
                            completedAt: new Date(att.fetchedAt) as any,
                            attestation: att.attestation,
                        });
                    } catch (e) {
                        logger.debug('xReserve not yet ready');
                    }
                } else {
                    if (!tx.messageHash) throw new Error('Missing message hash');
                    try {
                        const att = await attestationService.fetchCircleAttestation(tx.messageHash);
                        await this.updateTransaction(tx.id, {
                            status: 'minting',
                            currentStep: 'mint',
                            attestation: att.attestation,
                            attestationFetchedAt: att.fetchedAt,
                        });
                    } catch (e) {
                        logger.debug('Circle attestation not yet ready');
                    }
                }
                break;

            case 'minting':
                if (tx.attestation && tx.messageHash) {
                    const mintTxId = await stacksMintService.mintUsdcx(tx.stacksAddress, tx.amount, tx.attestation, tx.messageHash);
                    await this.updateTransaction(tx.id, {
                        destinationTxHash: mintTxId,
                        status: 'complete',
                        completedAt: new Date() as any,
                    });
                }
                break;
        }
    }

    private async processWithdrawal(tx: BridgeTransaction): Promise<void> {
        // Basic withdrawal flow implementation (placeholder similar to backend)
        if (tx.status === 'pending' || tx.status === 'confirming') {
            await this.updateTransaction(tx.id, { status: 'attesting', currentStep: 'attestation' });
        } else if (tx.status === 'attesting') {
            try {
                const att = await attestationService.fetchStacksAttestation(tx.sourceTxHash);
                await this.updateTransaction(tx.id, {
                    status: 'complete', // Simplifying for now as backend did
                    completedAt: new Date() as any,
                    attestation: att.attestation,
                    messageHash: att.messageHash,
                });
            } catch (e) {
                logger.debug('Stacks attestation not yet ready');
            }
        }
    }
}

export const transactionMonitorService = new TransactionMonitorService();
