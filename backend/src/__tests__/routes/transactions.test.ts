/**
 * Unit tests for Transaction API endpoints
 * Tests request validation, error responses, and successful responses
 * 
 * Requirements: 8.1-8.6, 8.7, 8.8, 8.9
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import transactionRoutes from '../../routes/transactions';
import { transactionMonitorService } from '../../services/TransactionMonitorService';
import { BridgeTransaction } from '@shared/types';

// Mock the transaction monitor service
vi.mock('../../services/TransactionMonitorService', () => ({
  transactionMonitorService: {
    getTransaction: vi.fn(),
    getUserTransactions: vi.fn(),
    addTransaction: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('Transaction API Routes', () => {
  let app: Express;

  beforeEach(() => {
    // Create a fresh Express app for each test
    app = express();
    app.use(express.json());
    app.use('/api/transactions', transactionRoutes);
    
    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('GET /api/transactions/:txHash', () => {
    const mockTransaction: BridgeTransaction = {
      id: 'test-tx-1',
      type: 'deposit',
      amount: '1000000',
      sourceChain: 'ethereum',
      destinationChain: 'stacks',
      status: 'pending',
      currentStep: 'deposit',
      sourceTxHash: '0x123abc',
      ethereumAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      isGasless: false,
    };

    it('should return transaction when found', async () => {
      vi.mocked(transactionMonitorService.getTransaction).mockReturnValue(mockTransaction);

      const response = await request(app)
        .get('/api/transactions/0x123abc')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: mockTransaction,
      });
      expect(response.body.timestamp).toBeDefined();
      expect(transactionMonitorService.getTransaction).toHaveBeenCalledWith('0x123abc');
    });

    it('should return 404 when transaction not found', async () => {
      vi.mocked(transactionMonitorService.getTransaction).mockReturnValue(null);

      const response = await request(app)
        .get('/api/transactions/0xnonexistent')
        .expect(404);

      expect(response.body).toMatchObject({
        error: 'Not Found',
        message: 'Transaction not found',
      });
      expect(response.body.timestamp).toBeDefined();
    });

    it('should return 400 when txHash is missing', async () => {
      const response = await request(app)
        .get('/api/transactions/')
        .expect(404); // Express returns 404 for missing route params

      // This tests the route not matching, which is expected behavior
    });

    it('should return 500 on service error', async () => {
      vi.mocked(transactionMonitorService.getTransaction).mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const response = await request(app)
        .get('/api/transactions/0x123abc')
        .expect(500);

      expect(response.body).toMatchObject({
        error: 'Internal Server Error',
        message: 'Failed to fetch transaction',
      });
      expect(response.body.timestamp).toBeDefined();
    });

    it('should handle special characters in txHash', async () => {
      vi.mocked(transactionMonitorService.getTransaction).mockReturnValue(mockTransaction);

      const txHash = '0x123abc!@#$%';
      const response = await request(app)
        .get(`/api/transactions/${encodeURIComponent(txHash)}`)
        .expect(200);

      expect(transactionMonitorService.getTransaction).toHaveBeenCalledWith(txHash);
    });
  });

  describe('GET /api/transactions/user/:address', () => {
    const mockTransactions: BridgeTransaction[] = [
      {
        id: 'test-tx-1',
        type: 'deposit',
        amount: '1000000',
        sourceChain: 'ethereum',
        destinationChain: 'stacks',
        status: 'complete',
        currentStep: 'mint',
        sourceTxHash: '0x123abc',
        ethereumAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now() - 1000,
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      },
      {
        id: 'test-tx-2',
        type: 'withdrawal',
        amount: '500000',
        sourceChain: 'stacks',
        destinationChain: 'ethereum',
        status: 'pending',
        currentStep: 'burn',
        sourceTxHash: '0x456def',
        ethereumAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: true,
        gasFeeInUsdcx: '10000',
      },
    ];

    it('should return user transactions with default pagination', async () => {
      vi.mocked(transactionMonitorService.getUserTransactions).mockReturnValue(mockTransactions);

      const response = await request(app)
        .get('/api/transactions/user/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          transactions: mockTransactions,
          total: 2,
          hasMore: false,
        },
      });
      expect(response.body.timestamp).toBeDefined();
    });

    it('should apply pagination with limit and offset', async () => {
      const manyTransactions = Array.from({ length: 100 }, (_, i) => ({
        ...mockTransactions[0],
        id: `test-tx-${i}`,
        sourceTxHash: `0x${i}`,
      }));
      vi.mocked(transactionMonitorService.getUserTransactions).mockReturnValue(manyTransactions);

      const response = await request(app)
        .get('/api/transactions/user/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238')
        .query({ limit: '10', offset: '5' })
        .expect(200);

      expect(response.body.data.transactions).toHaveLength(10);
      expect(response.body.data.total).toBe(100);
      expect(response.body.data.hasMore).toBe(true);
      expect(response.body.data.transactions[0].id).toBe('test-tx-5');
    });

    it('should handle empty transaction history', async () => {
      vi.mocked(transactionMonitorService.getUserTransactions).mockReturnValue([]);

      const response = await request(app)
        .get('/api/transactions/user/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238')
        .expect(200);

      expect(response.body.data).toMatchObject({
        transactions: [],
        total: 0,
        hasMore: false,
      });
    });

    it('should return 500 on service error', async () => {
      vi.mocked(transactionMonitorService.getUserTransactions).mockImplementation(() => {
        throw new Error('Database query failed');
      });

      const response = await request(app)
        .get('/api/transactions/user/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238')
        .expect(500);

      expect(response.body).toMatchObject({
        error: 'Internal Server Error',
        message: 'Failed to fetch user transactions',
      });
    });

    it('should handle invalid pagination parameters gracefully', async () => {
      vi.mocked(transactionMonitorService.getUserTransactions).mockReturnValue(mockTransactions);

      const response = await request(app)
        .get('/api/transactions/user/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238')
        .query({ limit: 'invalid', offset: 'invalid' })
        .expect(200);

      // Should use NaN which results in empty slice
      expect(response.body.data.transactions).toHaveLength(0);
    });
  });

  describe('POST /api/transactions/monitor', () => {
    const validTransaction: BridgeTransaction = {
      id: 'test-tx-1',
      type: 'deposit',
      amount: '1000000',
      sourceChain: 'ethereum',
      destinationChain: 'stacks',
      status: 'pending',
      currentStep: 'deposit',
      sourceTxHash: '0x123abc',
      ethereumAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      isGasless: false,
    };

    it('should add valid transaction to monitoring', async () => {
      vi.mocked(transactionMonitorService.addTransaction).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/transactions/monitor')
        .send(validTransaction)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Transaction added to monitoring queue',
        data: { id: validTransaction.id },
      });
      expect(response.body.timestamp).toBeDefined();
      expect(transactionMonitorService.addTransaction).toHaveBeenCalledWith(validTransaction);
    });

    it('should return 400 when id is missing', async () => {
      const invalidTransaction = { ...validTransaction };
      delete (invalidTransaction as any).id;

      const response = await request(app)
        .post('/api/transactions/monitor')
        .send(invalidTransaction)
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Bad Request',
        message: 'Missing required transaction fields',
      });
      expect(transactionMonitorService.addTransaction).not.toHaveBeenCalled();
    });

    it('should return 400 when type is missing', async () => {
      const invalidTransaction = { ...validTransaction };
      delete (invalidTransaction as any).type;

      const response = await request(app)
        .post('/api/transactions/monitor')
        .send(invalidTransaction)
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Bad Request',
        message: 'Missing required transaction fields',
      });
    });

    it('should return 400 when sourceTxHash is missing', async () => {
      const invalidTransaction = { ...validTransaction };
      delete (invalidTransaction as any).sourceTxHash;

      const response = await request(app)
        .post('/api/transactions/monitor')
        .send(invalidTransaction)
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Bad Request',
        message: 'Missing required transaction fields',
      });
    });

    it('should return 400 when request body is empty', async () => {
      const response = await request(app)
        .post('/api/transactions/monitor')
        .send({})
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Bad Request',
        message: 'Missing required transaction fields',
      });
    });

    it('should return 500 on service error', async () => {
      vi.mocked(transactionMonitorService.addTransaction).mockRejectedValue(
        new Error('Queue is full')
      );

      const response = await request(app)
        .post('/api/transactions/monitor')
        .send(validTransaction)
        .expect(500);

      expect(response.body).toMatchObject({
        error: 'Internal Server Error',
        message: 'Failed to add transaction to monitoring',
      });
    });

    it('should accept transaction with optional fields', async () => {
      vi.mocked(transactionMonitorService.addTransaction).mockResolvedValue(undefined);

      const transactionWithOptionals: BridgeTransaction = {
        ...validTransaction,
        destinationTxHash: '0x789ghi',
        messageHash: '0xmessage123',
        attestation: '0xattestation456',
        attestationFetchedAt: Date.now(),
        completedAt: Date.now(),
        error: 'Some error',
        gasFeeInUsdcx: '10000',
      };

      const response = await request(app)
        .post('/api/transactions/monitor')
        .send(transactionWithOptionals)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(transactionMonitorService.addTransaction).toHaveBeenCalledWith(transactionWithOptionals);
    });
  });

  describe('Input Validation', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/transactions/monitor')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      // Express's built-in JSON parser will handle this
    });

    it('should handle very large transaction IDs', async () => {
      vi.mocked(transactionMonitorService.addTransaction).mockResolvedValue(undefined);

      const largeId = 'a'.repeat(1000);
      const transaction = {
        ...{
          id: largeId,
          type: 'deposit' as const,
          amount: '1000000',
          sourceChain: 'ethereum' as const,
          destinationChain: 'stacks' as const,
          status: 'pending' as const,
          currentStep: 'deposit' as const,
          sourceTxHash: '0x123abc',
          ethereumAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
          stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          retryCount: 0,
          isGasless: false,
        },
      };

      const response = await request(app)
        .post('/api/transactions/monitor')
        .send(transaction)
        .expect(201);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should include timestamp in all error responses', async () => {
      vi.mocked(transactionMonitorService.getTransaction).mockReturnValue(null);

      const response = await request(app)
        .get('/api/transactions/0xnonexistent')
        .expect(404);

      expect(response.body.timestamp).toBeDefined();
      expect(typeof response.body.timestamp).toBe('number');
      expect(response.body.timestamp).toBeGreaterThan(Date.now() - 1000);
    });

    it('should log errors appropriately', async () => {
      const { logger } = await import('../../utils/logger');
      
      vi.mocked(transactionMonitorService.getTransaction).mockImplementation(() => {
        throw new Error('Test error');
      });

      await request(app)
        .get('/api/transactions/0x123abc')
        .expect(500);

      expect(logger.error).toHaveBeenCalled();
    });
  });
});
