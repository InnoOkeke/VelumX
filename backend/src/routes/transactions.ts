/**
 * Transaction API Routes
 * Handles transaction status, history, and monitoring
 */

import { Router, Request, Response } from 'express';
import { transactionMonitorService } from '../services/TransactionMonitorService';
import { logger } from '../utils/logger';
import { BridgeTransaction } from '@shared/types';

const router = Router();

/**
 * GET /api/transactions/:txHash
 * Get transaction status by transaction hash
 */
router.get('/:txHash', async (req: Request, res: Response) => {
  try {
    const txHash = req.params.txHash as string;

    if (!txHash) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Transaction hash is required',
        timestamp: Date.now(),
      });
    }

    logger.info('Fetching transaction status', { txHash });

    const transaction = transactionMonitorService.getTransaction(txHash);

    if (!transaction) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Transaction not found',
        timestamp: Date.now(),
      });
    }

    res.status(200).json({
      success: true,
      data: transaction,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Error fetching transaction', {
      txHash: req.params.txHash,
      error: (error as Error).message,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch transaction',
      timestamp: Date.now(),
    });
  }
});

/**
 * GET /api/transactions/user/:address
 * Get user's transaction history
 */
router.get('/user/:address', async (req: Request, res: Response) => {
  try {
    const address = req.params.address as string;
    const { limit = '50', offset = '0' } = req.query;

    if (!address) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Address is required',
        timestamp: Date.now(),
      });
    }

    logger.info('Fetching user transactions', { address });

    const allTransactions = transactionMonitorService.getUserTransactions(address);
    
    // Apply pagination
    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);
    const transactions = allTransactions.slice(offsetNum, offsetNum + limitNum);
    const hasMore = allTransactions.length > offsetNum + limitNum;

    res.status(200).json({
      success: true,
      data: {
        transactions,
        total: allTransactions.length,
        hasMore,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Error fetching user transactions', {
      address: req.params.address,
      error: (error as Error).message,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch user transactions',
      timestamp: Date.now(),
    });
  }
});

/**
 * POST /api/transactions/monitor
 * Add transaction to monitoring queue
 */
router.post('/monitor', async (req: Request, res: Response) => {
  try {
    const transaction: BridgeTransaction = req.body;

    // Validate required fields
    if (!transaction.id || !transaction.type || !transaction.sourceTxHash) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required transaction fields',
        timestamp: Date.now(),
      });
    }

    logger.info('Adding transaction to monitoring', {
      id: transaction.id,
      type: transaction.type,
    });

    await transactionMonitorService.addTransaction(transaction);

    res.status(201).json({
      success: true,
      message: 'Transaction added to monitoring queue',
      data: { id: transaction.id },
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Error adding transaction to monitoring', {
      error: (error as Error).message,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to add transaction to monitoring',
      timestamp: Date.now(),
    });
  }
});

/**
 * POST /api/transactions/admin/clear-stuck
 * Mark all stuck/pending transactions as failed (admin endpoint)
 */
router.post('/admin/clear-stuck', async (req: Request, res: Response) => {
  try {
    logger.info('Clearing stuck transactions');

    const allTransactions = transactionMonitorService.getAllTransactions();
    const stuckTransactions = allTransactions.filter(
      tx => tx.status !== 'complete' && tx.status !== 'failed'
    );

    logger.info('Found stuck transactions', { count: stuckTransactions.length });

    // Mark each as failed
    for (const tx of stuckTransactions) {
      await transactionMonitorService.updateTransaction(tx.id, {
        status: 'failed',
        error: 'Manually cleared - stuck transaction',
      });
    }

    res.status(200).json({
      success: true,
      message: `Cleared ${stuckTransactions.length} stuck transactions`,
      data: {
        clearedCount: stuckTransactions.length,
        transactionIds: stuckTransactions.map(tx => tx.id),
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Error clearing stuck transactions', {
      error: (error as Error).message,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to clear stuck transactions',
      timestamp: Date.now(),
    });
  }
});

export default router;
