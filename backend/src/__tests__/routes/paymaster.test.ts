/**
 * Unit tests for Paymaster API endpoints
 * Tests request validation, error responses, and successful responses
 * 
 * Requirements: 8.3, 8.4, 8.7, 8.8, 8.9
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import paymasterRoutes from '../../routes/paymaster';
import { paymasterService } from '../../services/PaymasterService';
import { FeeEstimate, ExchangeRates } from '@shared/types';

// Mock the paymaster service
vi.mock('../../services/PaymasterService', () => ({
  paymasterService: {
    estimateFee: vi.fn(),
    sponsorTransaction: vi.fn(),
    validateUserBalance: vi.fn(),
    getExchangeRates: vi.fn(),
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

// Mock rate limiter middleware
vi.mock('../../middleware/rate-limit', () => ({
  createStrictRateLimiter: vi.fn(() => (req: any, res: any, next: any) => next()),
}));

describe('Paymaster API Routes', () => {
  let app: Express;

  beforeEach(() => {
    // Create a fresh Express app for each test
    app = express();
    app.use(express.json());
    app.use('/api/paymaster', paymasterRoutes);

    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('POST /api/paymaster/estimate', () => {
    const mockFeeEstimate: FeeEstimate = {
      gasInStx: 100000n,
      gasInUsdcx: 50000n,
      stxToUsd: 0.5,
      usdcToUsd: 1.0,
      markup: 5,
      estimatedAt: Date.now(),
      validUntil: Date.now() + 60000,
    };

    it('should return fee estimate for valid request', async () => {
      vi.mocked(paymasterService.estimateFee).mockResolvedValue(mockFeeEstimate);

      const response = await request(app)
        .post('/api/paymaster/estimate')
        .send({ estimatedGasInStx: '100000' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          gasInStx: '100000',
          gasInUsdcx: '50000',
          stxToUsd: 0.5,
          usdcToUsd: 1.0,
          markup: 5,
        },
      });
      expect(response.body.timestamp).toBeDefined();
      expect(paymasterService.estimateFee).toHaveBeenCalledWith(100000n);
    });

    it('should return 400 when estimatedGasInStx is missing', async () => {
      const response = await request(app)
        .post('/api/paymaster/estimate')
        .send({})
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Bad Request',
        message: 'estimatedGasInStx is required',
      });
      expect(paymasterService.estimateFee).not.toHaveBeenCalled();
    });

    it('should return 400 when estimatedGasInStx is zero', async () => {
      const response = await request(app)
        .post('/api/paymaster/estimate')
        .send({ estimatedGasInStx: '0' })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Bad Request',
        message: 'estimatedGasInStx must be greater than 0',
      });
      expect(paymasterService.estimateFee).not.toHaveBeenCalled();
    });

    it('should return 400 when estimatedGasInStx is negative', async () => {
      const response = await request(app)
        .post('/api/paymaster/estimate')
        .send({ estimatedGasInStx: '-100' })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Bad Request',
        message: 'estimatedGasInStx must be greater than 0',
      });
    });

    it('should handle very large gas amounts', async () => {
      const largeAmount = '999999999999999999';
      vi.mocked(paymasterService.estimateFee).mockResolvedValue({
        ...mockFeeEstimate,
        gasInStx: BigInt(largeAmount),
        gasInUsdcx: BigInt(largeAmount) * 2n,
      });

      const response = await request(app)
        .post('/api/paymaster/estimate')
        .send({ estimatedGasInStx: largeAmount })
        .expect(200);

      expect(response.body.data.gasInStx).toBe(largeAmount);
      expect(paymasterService.estimateFee).toHaveBeenCalledWith(BigInt(largeAmount));
    });

    it('should return 500 on service error', async () => {
      vi.mocked(paymasterService.estimateFee).mockRejectedValue(
        new Error('Exchange rate API unavailable')
      );

      const response = await request(app)
        .post('/api/paymaster/estimate')
        .send({ estimatedGasInStx: '100000' })
        .expect(500);

      expect(response.body).toMatchObject({
        error: 'Internal Server Error',
        message: 'Failed to estimate fee',
      });
    });

    it('should convert bigint values to strings in response', async () => {
      vi.mocked(paymasterService.estimateFee).mockResolvedValue(mockFeeEstimate);

      const response = await request(app)
        .post('/api/paymaster/estimate')
        .send({ estimatedGasInStx: '100000' })
        .expect(200);

      // Verify all bigint fields are converted to strings
      expect(typeof response.body.data.gasInStx).toBe('string');
      expect(typeof response.body.data.gasInUsdcx).toBe('string');
    });
  });

  describe('POST /api/paymaster/sponsor', () => {
    const validRequest = {
      transaction: '0x123abc',
      userAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      estimatedFee: '50000',
    };

    it('should sponsor transaction when user has sufficient balance', async () => {
      vi.mocked(paymasterService.validateUserBalance).mockResolvedValue(true);
      vi.mocked(paymasterService.sponsorTransaction).mockResolvedValue('0xtxid123');

      const response = await request(app)
        .post('/api/paymaster/sponsor')
        .send(validRequest)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: { txid: '0xtxid123' },
        message: 'Transaction sponsored successfully',
      });
      expect(paymasterService.validateUserBalance).toHaveBeenCalledWith(
        validRequest.userAddress,
        50000n
      );
      expect(paymasterService.sponsorTransaction).toHaveBeenCalledWith(
        validRequest.transaction,
        validRequest.userAddress,
        50000n
      );
    });

    it('should return 400 when transaction is missing', async () => {
      const response = await request(app)
        .post('/api/paymaster/sponsor')
        .send({
          userAddress: validRequest.userAddress,
          estimatedFee: validRequest.estimatedFee,
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Bad Request',
        message: 'transaction, userAddress, and estimatedFee are required',
      });
      expect(paymasterService.validateUserBalance).not.toHaveBeenCalled();
    });

    it('should return 400 when userAddress is missing', async () => {
      const response = await request(app)
        .post('/api/paymaster/sponsor')
        .send({
          transaction: validRequest.transaction,
          estimatedFee: validRequest.estimatedFee,
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Bad Request',
        message: 'transaction, userAddress, and estimatedFee are required',
      });
    });

    it('should return 400 when estimatedFee is missing', async () => {
      const response = await request(app)
        .post('/api/paymaster/sponsor')
        .send({
          transaction: validRequest.transaction,
          userAddress: validRequest.userAddress,
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Bad Request',
        message: 'transaction, userAddress, and estimatedFee are required',
      });
    });

    it('should return 400 when user has insufficient balance', async () => {
      vi.mocked(paymasterService.validateUserBalance).mockResolvedValue(false);

      const response = await request(app)
        .post('/api/paymaster/sponsor')
        .send(validRequest)
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Insufficient Balance',
        message: 'User does not have sufficient USDCx balance to pay fee',
      });
      expect(paymasterService.sponsorTransaction).not.toHaveBeenCalled();
    });

    it('should return 503 when relayer balance is too low', async () => {
      vi.mocked(paymasterService.validateUserBalance).mockResolvedValue(true);
      vi.mocked(paymasterService.sponsorTransaction).mockRejectedValue(
        new Error('Relayer balance too low')
      );

      const response = await request(app)
        .post('/api/paymaster/sponsor')
        .send(validRequest)
        .expect(503);

      expect(response.body).toMatchObject({
        error: 'Service Unavailable',
        message: 'Paymaster service temporarily unavailable',
      });
    });

    it('should return 500 on other service errors', async () => {
      vi.mocked(paymasterService.validateUserBalance).mockResolvedValue(true);
      vi.mocked(paymasterService.sponsorTransaction).mockRejectedValue(
        new Error('Network error')
      );

      const response = await request(app)
        .post('/api/paymaster/sponsor')
        .send(validRequest)
        .expect(500);

      expect(response.body).toMatchObject({
        error: 'Internal Server Error',
        message: 'Network error',
      });
    });

    it('should handle very large fee amounts', async () => {
      const largeRequest = {
        ...validRequest,
        estimatedFee: '999999999999999999',
      };

      vi.mocked(paymasterService.validateUserBalance).mockResolvedValue(true);
      vi.mocked(paymasterService.sponsorTransaction).mockResolvedValue('0xtxid123');

      const response = await request(app)
        .post('/api/paymaster/sponsor')
        .send(largeRequest)
        .expect(200);

      expect(paymasterService.validateUserBalance).toHaveBeenCalledWith(
        largeRequest.userAddress,
        BigInt(largeRequest.estimatedFee)
      );
    });

    it('should validate balance before sponsoring', async () => {
      vi.mocked(paymasterService.validateUserBalance).mockResolvedValue(false);

      await request(app)
        .post('/api/paymaster/sponsor')
        .send(validRequest)
        .expect(400);

      expect(paymasterService.validateUserBalance).toHaveBeenCalled();
      expect(paymasterService.sponsorTransaction).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/paymaster/rates', () => {
    const mockRates: ExchangeRates = {
      stxToUsd: 0.5,
      usdcToUsd: 1.0,
      timestamp: Date.now(),
    };

    it('should return current exchange rates', async () => {
      vi.mocked(paymasterService.getExchangeRates).mockResolvedValue(mockRates);

      const response = await request(app)
        .get('/api/paymaster/rates')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: mockRates,
      });
      expect(response.body.timestamp).toBeDefined();
      expect(paymasterService.getExchangeRates).toHaveBeenCalled();
    });

    it('should return 500 on service error', async () => {
      vi.mocked(paymasterService.getExchangeRates).mockRejectedValue(
        new Error('Exchange rate API unavailable')
      );

      const response = await request(app)
        .get('/api/paymaster/rates')
        .expect(500);

      expect(response.body).toMatchObject({
        error: 'Internal Server Error',
        message: 'Failed to fetch exchange rates',
      });
    });

    it('should include all required rate fields', async () => {
      vi.mocked(paymasterService.getExchangeRates).mockResolvedValue(mockRates);

      const response = await request(app)
        .get('/api/paymaster/rates')
        .expect(200);

      expect(response.body.data).toHaveProperty('stxToUsd');
      expect(response.body.data).toHaveProperty('usdcToUsd');
      expect(response.body.data).toHaveProperty('timestamp');
    });

    it('should handle cached rates', async () => {
      const cachedRates = {
        ...mockRates,
        timestamp: Date.now() - 30000, // 30 seconds old
      };
      vi.mocked(paymasterService.getExchangeRates).mockResolvedValue(cachedRates);

      const response = await request(app)
        .get('/api/paymaster/rates')
        .expect(200);

      expect(response.body.data.timestamp).toBe(cachedRates.timestamp);
    });
  });

  describe('Error Handling', () => {
    it('should include timestamp in all responses', async () => {
      const response = await request(app)
        .post('/api/paymaster/estimate')
        .send({})
        .expect(400);

      expect(response.body.timestamp).toBeDefined();
      expect(typeof response.body.timestamp).toBe('number');
      expect(response.body.timestamp).toBeGreaterThan(Date.now() - 1000);
    });

    it('should log errors appropriately', async () => {
      const { logger } = await import('../../utils/logger');

      vi.mocked(paymasterService.estimateFee).mockRejectedValue(
        new Error('Test error')
      );

      await request(app)
        .post('/api/paymaster/estimate')
        .send({ estimatedGasInStx: '100000' })
        .expect(500);

      expect(logger.error).toHaveBeenCalled();
    });

    it('should differentiate between balance and service errors', async () => {
      // Insufficient balance error
      vi.mocked(paymasterService.validateUserBalance).mockResolvedValue(false);
      const balanceResponse = await request(app)
        .post('/api/paymaster/sponsor')
        .send({
          transaction: '0x123',
          userAddress: 'ST1TEST',
          estimatedFee: '100',
        });
      expect(balanceResponse.status).toBe(400);
      expect(balanceResponse.body.error).toBe('Insufficient Balance');

      // Service unavailable error
      vi.mocked(paymasterService.validateUserBalance).mockResolvedValue(true);
      vi.mocked(paymasterService.sponsorTransaction).mockRejectedValue(
        new Error('Relayer balance too low')
      );
      const serviceResponse = await request(app)
        .post('/api/paymaster/sponsor')
        .send({
          transaction: '0x123',
          userAddress: 'ST1TEST',
          estimatedFee: '100',
        });
      expect(serviceResponse.status).toBe(503);
      expect(serviceResponse.body.error).toBe('Service Unavailable');
    });
  });

  describe('Input Validation', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/paymaster/estimate')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);
    });

    it('should handle non-numeric estimatedGasInStx', async () => {
      const response = await request(app)
        .post('/api/paymaster/estimate')
        .send({ estimatedGasInStx: 'not-a-number' })
        .expect(500); // BigInt conversion will throw

      // The error should be caught and return 500
      expect(response.body.error).toBe('Internal Server Error');
    });

    it('should handle empty request body', async () => {
      const response = await request(app)
        .post('/api/paymaster/sponsor')
        .send({})
        .expect(400);

      expect(response.body.message).toContain('required');
    });
  });

  describe('Response Format', () => {
    it('should return consistent success response format', async () => {
      vi.mocked(paymasterService.getExchangeRates).mockResolvedValue({
        stxToUsd: 0.5,
        usdcToUsd: 1.0,
        timestamp: Date.now(),
      });

      const response = await request(app)
        .get('/api/paymaster/rates')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return consistent error response format', async () => {
      const response = await request(app)
        .post('/api/paymaster/estimate')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).not.toHaveProperty('success');
    });
  });
});
