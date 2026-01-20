/**
 * Unit tests for Swap API endpoints
 * Tests request validation, error responses, and successful responses
 * 
 * Requirements: 8.7, 8.8, 8.9
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import swapRoutes from '../../routes/swap';
import { swapService } from '../../services/SwapService';

// Mock the swap service
vi.mock('../../services/SwapService', () => ({
  swapService: {
    getSupportedTokens: vi.fn(),
    getSwapQuote: vi.fn(),
    validateSwap: vi.fn(),
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

describe('Swap API Routes', () => {
  let app: Express;

  beforeEach(() => {
    // Create a fresh Express app for each test
    app = express();
    app.use(express.json());
    app.use('/api/swap', swapRoutes);
    
    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('GET /api/swap/tokens', () => {
    const mockTokens = [
      {
        symbol: 'USDCx',
        address: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx',
        decimals: 6,
      },
      {
        symbol: 'STX',
        address: 'STX',
        decimals: 6,
      },
      {
        symbol: 'ALEX',
        address: 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.alex-token',
        decimals: 8,
      },
    ];

    it('should return list of supported tokens', async () => {
      vi.mocked(swapService.getSupportedTokens).mockResolvedValue(mockTokens);

      const response = await request(app)
        .get('/api/swap/tokens')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: mockTokens,
      });
      expect(swapService.getSupportedTokens).toHaveBeenCalled();
    });

    it('should return 500 on service error', async () => {
      vi.mocked(swapService.getSupportedTokens).mockRejectedValue(
        new Error('Failed to fetch tokens from DEX')
      );

      const response = await request(app)
        .get('/api/swap/tokens')
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Failed to fetch supported tokens',
      });
    });

    it('should handle empty token list', async () => {
      vi.mocked(swapService.getSupportedTokens).mockResolvedValue([]);

      const response = await request(app)
        .get('/api/swap/tokens')
        .expect(200);

      expect(response.body.data).toEqual([]);
    });
  });

  describe('POST /api/swap/quote', () => {
    const mockQuote = {
      inputToken: 'USDCx',
      outputToken: 'STX',
      inputAmount: 1000000n,
      outputAmount: 2000000n,
      estimatedFee: 5000n,
      priceImpact: 0.5,
      route: ['USDCx', 'STX'],
    };

    const validRequest = {
      inputToken: 'USDCx',
      outputToken: 'STX',
      inputAmount: '1000000',
    };

    it('should return swap quote for valid request', async () => {
      vi.mocked(swapService.getSwapQuote).mockResolvedValue(mockQuote);

      const response = await request(app)
        .post('/api/swap/quote')
        .send(validRequest)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          inputToken: 'USDCx',
          outputToken: 'STX',
          inputAmount: '1000000',
          outputAmount: '2000000',
          estimatedFee: '5000',
          priceImpact: 0.5,
          route: ['USDCx', 'STX'],
        },
      });
      expect(swapService.getSwapQuote).toHaveBeenCalledWith(
        'USDCx',
        'STX',
        1000000n
      );
    });

    it('should return 400 when inputToken is missing', async () => {
      const response = await request(app)
        .post('/api/swap/quote')
        .send({
          outputToken: 'STX',
          inputAmount: '1000000',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Missing required parameters: inputToken, outputToken, inputAmount',
      });
      expect(swapService.getSwapQuote).not.toHaveBeenCalled();
    });

    it('should return 400 when outputToken is missing', async () => {
      const response = await request(app)
        .post('/api/swap/quote')
        .send({
          inputToken: 'USDCx',
          inputAmount: '1000000',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Missing required parameters: inputToken, outputToken, inputAmount',
      });
    });

    it('should return 400 when inputAmount is missing', async () => {
      const response = await request(app)
        .post('/api/swap/quote')
        .send({
          inputToken: 'USDCx',
          outputToken: 'STX',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Missing required parameters: inputToken, outputToken, inputAmount',
      });
    });

    it('should return 400 when inputAmount is zero', async () => {
      const response = await request(app)
        .post('/api/swap/quote')
        .send({
          inputToken: 'USDCx',
          outputToken: 'STX',
          inputAmount: '0',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Input amount must be greater than 0',
      });
    });

    it('should return 400 when inputAmount is negative', async () => {
      const response = await request(app)
        .post('/api/swap/quote')
        .send({
          inputToken: 'USDCx',
          outputToken: 'STX',
          inputAmount: '-1000',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Input amount must be greater than 0',
      });
    });

    it('should handle very large amounts', async () => {
      const largeAmount = '999999999999999999';
      vi.mocked(swapService.getSwapQuote).mockResolvedValue({
        ...mockQuote,
        inputAmount: BigInt(largeAmount),
        outputAmount: BigInt(largeAmount) * 2n,
      });

      const response = await request(app)
        .post('/api/swap/quote')
        .send({
          inputToken: 'USDCx',
          outputToken: 'STX',
          inputAmount: largeAmount,
        })
        .expect(200);

      expect(response.body.data.inputAmount).toBe(largeAmount);
      expect(swapService.getSwapQuote).toHaveBeenCalledWith(
        'USDCx',
        'STX',
        BigInt(largeAmount)
      );
    });

    it('should return 500 on service error', async () => {
      vi.mocked(swapService.getSwapQuote).mockRejectedValue(
        new Error('DEX API unavailable')
      );

      const response = await request(app)
        .post('/api/swap/quote')
        .send(validRequest)
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Failed to get swap quote',
      });
    });

    it('should convert bigint values to strings in response', async () => {
      vi.mocked(swapService.getSwapQuote).mockResolvedValue(mockQuote);

      const response = await request(app)
        .post('/api/swap/quote')
        .send(validRequest)
        .expect(200);

      // Verify all bigint fields are converted to strings
      expect(typeof response.body.data.inputAmount).toBe('string');
      expect(typeof response.body.data.outputAmount).toBe('string');
      expect(typeof response.body.data.estimatedFee).toBe('string');
    });
  });

  describe('POST /api/swap/validate', () => {
    const validRequest = {
      userAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      inputToken: 'USDCx',
      inputAmount: '1000000',
    };

    it('should return valid for valid swap', async () => {
      vi.mocked(swapService.validateSwap).mockResolvedValue({
        valid: true,
      });

      const response = await request(app)
        .post('/api/swap/validate')
        .send(validRequest)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: { valid: true },
      });
      expect(swapService.validateSwap).toHaveBeenCalledWith(
        validRequest.userAddress,
        validRequest.inputToken,
        1000000n
      );
    });

    it('should return 400 when validation fails', async () => {
      vi.mocked(swapService.validateSwap).mockResolvedValue({
        valid: false,
        error: 'Insufficient balance',
      });

      const response = await request(app)
        .post('/api/swap/validate')
        .send(validRequest)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Insufficient balance',
      });
    });

    it('should return 400 when userAddress is missing', async () => {
      const response = await request(app)
        .post('/api/swap/validate')
        .send({
          inputToken: 'USDCx',
          inputAmount: '1000000',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Missing required parameters: userAddress, inputToken, inputAmount',
      });
      expect(swapService.validateSwap).not.toHaveBeenCalled();
    });

    it('should return 400 when inputToken is missing', async () => {
      const response = await request(app)
        .post('/api/swap/validate')
        .send({
          userAddress: validRequest.userAddress,
          inputAmount: '1000000',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Missing required parameters: userAddress, inputToken, inputAmount',
      });
    });

    it('should return 400 when inputAmount is missing', async () => {
      const response = await request(app)
        .post('/api/swap/validate')
        .send({
          userAddress: validRequest.userAddress,
          inputToken: 'USDCx',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Missing required parameters: userAddress, inputToken, inputAmount',
      });
    });

    it('should return 500 on service error', async () => {
      vi.mocked(swapService.validateSwap).mockRejectedValue(
        new Error('Failed to check balance')
      );

      const response = await request(app)
        .post('/api/swap/validate')
        .send(validRequest)
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Failed to validate swap',
      });
    });

    it('should handle various validation error messages', async () => {
      const errorMessages = [
        'Insufficient balance',
        'Token not supported',
        'Amount below minimum',
        'Slippage too high',
      ];

      for (const errorMessage of errorMessages) {
        vi.mocked(swapService.validateSwap).mockResolvedValue({
          valid: false,
          error: errorMessage,
        });

        const response = await request(app)
          .post('/api/swap/validate')
          .send(validRequest)
          .expect(400);

        expect(response.body.error).toBe(errorMessage);
      }
    });
  });

  describe('Error Handling', () => {
    it('should log errors appropriately', async () => {
      const { logger } = await import('../../utils/logger');
      
      vi.mocked(swapService.getSupportedTokens).mockRejectedValue(
        new Error('Test error')
      );

      await request(app)
        .get('/api/swap/tokens')
        .expect(500);

      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/swap/quote')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);
    });

    it('should handle non-numeric inputAmount', async () => {
      const response = await request(app)
        .post('/api/swap/quote')
        .send({
          inputToken: 'USDCx',
          outputToken: 'STX',
          inputAmount: 'not-a-number',
        })
        .expect(500); // BigInt conversion will throw

      expect(response.body.success).toBe(false);
    });
  });

  describe('Response Format', () => {
    it('should return consistent success response format', async () => {
      vi.mocked(swapService.getSupportedTokens).mockResolvedValue([]);

      const response = await request(app)
        .get('/api/swap/tokens')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
    });

    it('should return consistent error response format', async () => {
      const response = await request(app)
        .post('/api/swap/quote')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body).not.toHaveProperty('data');
    });
  });
});
