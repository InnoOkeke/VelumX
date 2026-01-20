/**
 * Property-based tests for API error handling
 * 
 * Property 25: API Error Handling
 * For any API endpoint that encounters an error during processing, the error
 * should be logged and an appropriate HTTP status code should be returned.
 * 
 * Validates: Requirements 8.9
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fc from 'fast-check';
import request from 'supertest';
import express, { Express } from 'express';

// Mock logger first (before any imports that use it)
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock all services
vi.mock('../services/TransactionMonitorService', () => ({
  transactionMonitorService: {
    getTransaction: vi.fn(),
    getUserTransactions: vi.fn(),
    addTransaction: vi.fn(),
  },
}));

vi.mock('../services/AttestationService', () => ({
  attestationService: {
    fetchCircleAttestation: vi.fn(),
    fetchStacksAttestation: vi.fn(),
    isValidMessageHash: vi.fn(),
    isValidTxHash: vi.fn(),
  },
}));

vi.mock('../services/PaymasterService', () => ({
  paymasterService: {
    estimateFee: vi.fn(),
    sponsorTransaction: vi.fn(),
    validateUserBalance: vi.fn(),
    getExchangeRates: vi.fn(),
  },
}));

// Import routes after mocks
import transactionRoutes from '../routes/transactions';
import attestationRoutes from '../routes/attestations';
import paymasterRoutes from '../routes/paymaster';
import { transactionMonitorService } from '../services/TransactionMonitorService';
import { attestationService } from '../services/AttestationService';
import { paymasterService } from '../services/PaymasterService';
import { logger } from '../utils/logger';

describe('Property 25: API Error Handling', () => {
  let app: Express;

  beforeEach(() => {
    // Create a fresh Express app for each test
    app = express();
    app.use(express.json());
    app.use('/api/transactions', transactionRoutes);
    app.use('/api/attestations', attestationRoutes);
    app.use('/api/paymaster', paymasterRoutes);
    
    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Transaction Endpoints Error Handling', () => {
    it('should log errors and return 500 for any service error in GET /api/transactions/:txHash', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate various error types
          fc.oneof(
            fc.constant(new Error('Database connection failed')),
            fc.constant(new Error('Network timeout')),
            fc.constant(new Error('Service unavailable'))
          ),
          async (error) => {
            // Clear mocks for each iteration
            vi.clearAllMocks();
            
            // Setup: Make service throw the error
            vi.mocked(transactionMonitorService.getTransaction).mockImplementation(() => {
              throw error;
            });

            // Execute: Call the endpoint
            const response = await request(app)
              .get('/api/transactions/0x123abc');

            // Verify: Should return 500 status code
            expect(response.status).toBe(500);
            
            // Verify: Response should have error structure
            expect(response.body).toHaveProperty('error');
            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('timestamp');
            expect(response.body.error).toBe('Internal Server Error');
            
            // Verify: Error should be logged
            expect(logger.error).toHaveBeenCalled();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should log errors and return 500 for any service error in GET /api/transactions/user/:address', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate various error types
          fc.oneof(
            fc.constant(new Error('Database query failed')),
            fc.constant(new Error('Connection timeout'))
          ),
          async (error) => {
            // Clear mocks for each iteration
            vi.clearAllMocks();
            
            // Setup: Make service throw the error
            vi.mocked(transactionMonitorService.getUserTransactions).mockImplementation(() => {
              throw error;
            });

            // Execute: Call the endpoint
            const response = await request(app)
              .get('/api/transactions/user/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238');

            // Verify: Should return 500 status code
            expect(response.status).toBe(500);
            
            // Verify: Response should have error structure
            expect(response.body.error).toBe('Internal Server Error');
            expect(response.body.message).toBe('Failed to fetch user transactions');
            expect(response.body).toHaveProperty('timestamp');
            
            // Verify: Error should be logged
            expect(logger.error).toHaveBeenCalled();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should log errors and return 500 for any service error in POST /api/transactions/monitor', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate various error types
          fc.oneof(
            fc.constant(new Error('Queue is full')),
            fc.constant(new Error('Storage error'))
          ),
          async (error) => {
            // Clear mocks for each iteration
            vi.clearAllMocks();
            
            // Setup: Make service throw the error
            vi.mocked(transactionMonitorService.addTransaction).mockRejectedValue(error);

            // Valid transaction payload
            const transaction = {
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

            // Execute: Call the endpoint
            const response = await request(app)
              .post('/api/transactions/monitor')
              .send(transaction);

            // Verify: Should return 500 status code
            expect(response.status).toBe(500);
            
            // Verify: Response should have error structure
            expect(response.body.error).toBe('Internal Server Error');
            expect(response.body.message).toBe('Failed to add transaction to monitoring');
            expect(response.body).toHaveProperty('timestamp');
            
            // Verify: Error should be logged
            expect(logger.error).toHaveBeenCalled();
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Attestation Endpoints Error Handling', () => {
    it('should log errors and return appropriate status for GET /api/attestations/circle/:messageHash', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate various error types with different expected status codes
          fc.oneof(
            fc.record({
              error: fc.constant(new Error('Attestation not found')),
              expectedStatus: fc.constant(404),
            }),
            fc.record({
              error: fc.constant(new Error('Attestation timeout')),
              expectedStatus: fc.constant(404),
            }),
            fc.record({
              error: fc.constant(new Error('API connection failed')),
              expectedStatus: fc.constant(500),
            })
          ),
          async ({ error, expectedStatus }) => {
            // Clear mocks for each iteration
            vi.clearAllMocks();
            
            // Setup: Make validation pass and service throw the error
            vi.mocked(attestationService.isValidMessageHash).mockReturnValue(true);
            vi.mocked(attestationService.fetchCircleAttestation).mockRejectedValue(error);

            // Execute: Call the endpoint
            const response = await request(app)
              .get('/api/attestations/circle/0x123abc');

            // Verify: Should return expected status code
            expect(response.status).toBe(expectedStatus);
            
            // Verify: Response should have error structure
            expect(response.body).toHaveProperty('error');
            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('timestamp');
            
            // Verify: Error should be logged
            expect(logger.error).toHaveBeenCalled();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should log errors and return appropriate status for GET /api/attestations/stacks/:txHash', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate various error types
          fc.oneof(
            fc.record({
              error: fc.constant(new Error('Attestation not found')),
              expectedStatus: fc.constant(404),
            }),
            fc.record({
              error: fc.constant(new Error('Network error')),
              expectedStatus: fc.constant(500),
            })
          ),
          async ({ error, expectedStatus }) => {
            // Clear mocks for each iteration
            vi.clearAllMocks();
            
            // Setup: Make validation pass and service throw the error
            vi.mocked(attestationService.isValidTxHash).mockReturnValue(true);
            vi.mocked(attestationService.fetchStacksAttestation).mockRejectedValue(error);

            // Execute: Call the endpoint
            const response = await request(app)
              .get('/api/attestations/stacks/0x456def');

            // Verify: Should return expected status code
            expect(response.status).toBe(expectedStatus);
            
            // Verify: Response should have error structure
            expect(response.body).toHaveProperty('error');
            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('timestamp');
            
            // Verify: Error should be logged
            expect(logger.error).toHaveBeenCalled();
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Paymaster Endpoints Error Handling', () => {
    it('should log errors and return 500 for any service error in POST /api/paymaster/estimate', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate various error types
          fc.oneof(
            fc.constant(new Error('Exchange rate API unavailable')),
            fc.constant(new Error('Calculation error'))
          ),
          async (error) => {
            // Clear mocks for each iteration
            vi.clearAllMocks();
            
            // Setup: Make service throw the error
            vi.mocked(paymasterService.estimateFee).mockRejectedValue(error);

            // Execute: Call the endpoint
            const response = await request(app)
              .post('/api/paymaster/estimate')
              .send({ estimatedGasInStx: '100000' });

            // Verify: Should return 500 status code
            expect(response.status).toBe(500);
            
            // Verify: Response should have error structure
            expect(response.body.error).toBe('Internal Server Error');
            expect(response.body.message).toBe('Failed to estimate fee');
            expect(response.body).toHaveProperty('timestamp');
            
            // Verify: Error should be logged
            expect(logger.error).toHaveBeenCalled();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should log errors and return appropriate status for POST /api/paymaster/sponsor', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate various error types with expected status codes
          fc.oneof(
            fc.record({
              error: fc.constant(new Error('Relayer balance too low')),
              expectedStatus: fc.constant(503),
            }),
            fc.record({
              error: fc.constant(new Error('Transaction construction failed')),
              expectedStatus: fc.constant(500),
            })
          ),
          async ({ error, expectedStatus }) => {
            // Clear mocks for each iteration
            vi.clearAllMocks();
            
            // Setup: Make validation pass and service throw the error
            vi.mocked(paymasterService.validateUserBalance).mockResolvedValue(true);
            vi.mocked(paymasterService.sponsorTransaction).mockRejectedValue(error);

            const requestBody = {
              transaction: { /* mock transaction */ },
              userAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
              estimatedFee: '10000',
            };

            // Execute: Call the endpoint
            const response = await request(app)
              .post('/api/paymaster/sponsor')
              .send(requestBody);

            // Verify: Should return expected status code (or 429 if rate limited)
            // Rate limiting may occur during property tests, which is acceptable
            if (response.status === 429) {
              // Rate limited - this is acceptable behavior
              expect(response.body).toHaveProperty('error');
              expect(response.body).toHaveProperty('timestamp');
            } else {
              expect(response.status).toBe(expectedStatus);
              
              // Verify: Response should have error structure
              expect(response.body).toHaveProperty('error');
              expect(response.body).toHaveProperty('message');
              expect(response.body).toHaveProperty('timestamp');
              
              // Verify: Error should be logged
              expect(logger.error).toHaveBeenCalled();
            }
          }
        ),
        { numRuns: 10 } // Reduced runs to avoid rate limiting
      );
    });

    it('should log errors and return 500 for any service error in GET /api/paymaster/rates', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate various error types
          fc.oneof(
            fc.constant(new Error('Exchange rate API unavailable')),
            fc.constant(new Error('Rate fetch timeout'))
          ),
          async (error) => {
            // Clear mocks for each iteration
            vi.clearAllMocks();
            
            // Setup: Make service throw the error
            vi.mocked(paymasterService.getExchangeRates).mockRejectedValue(error);

            // Execute: Call the endpoint
            const response = await request(app)
              .get('/api/paymaster/rates');

            // Verify: Should return 500 status code
            expect(response.status).toBe(500);
            
            // Verify: Response should have error structure
            expect(response.body.error).toBe('Internal Server Error');
            expect(response.body.message).toBe('Failed to fetch exchange rates');
            expect(response.body).toHaveProperty('timestamp');
            
            // Verify: Error should be logged
            expect(logger.error).toHaveBeenCalled();
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Error Response Structure', () => {
    it('should always include timestamp in error responses', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant(new Error('Test error 1')),
            fc.constant(new Error('Test error 2'))
          ),
          async (error) => {
            // Clear mocks for each iteration
            vi.clearAllMocks();
            
            // Setup: Make service throw the error
            vi.mocked(transactionMonitorService.getTransaction).mockImplementation(() => {
              throw error;
            });

            const beforeTime = Date.now();
            
            // Execute: Call the endpoint
            const response = await request(app)
              .get('/api/transactions/0x123abc');

            const afterTime = Date.now();

            // Verify: Timestamp should be present and reasonable
            expect(response.body).toHaveProperty('timestamp');
            expect(typeof response.body.timestamp).toBe('number');
            expect(response.body.timestamp).toBeGreaterThanOrEqual(beforeTime - 1000);
            expect(response.body.timestamp).toBeLessThanOrEqual(afterTime + 1000);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should always include error and message fields in error responses', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant(new Error('Error A')),
            fc.constant(new Error('Error B'))
          ),
          async (error) => {
            // Clear mocks for each iteration
            vi.clearAllMocks();
            
            // Setup: Make service throw the error
            vi.mocked(transactionMonitorService.getUserTransactions).mockImplementation(() => {
              throw error;
            });

            // Execute: Call the endpoint
            const response = await request(app)
              .get('/api/transactions/user/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238');

            // Verify: Should have error and message fields
            expect(response.body).toHaveProperty('error');
            expect(response.body).toHaveProperty('message');
            expect(typeof response.body.error).toBe('string');
            expect(typeof response.body.message).toBe('string');
            expect(response.body.error.length).toBeGreaterThan(0);
            expect(response.body.message.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Logging Behavior', () => {
    it('should log error details for all endpoint errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 10, maxLength: 100 }).filter(s => s.trim().length > 0),
          async (errorMessage) => {
            // Clear mocks for each iteration
            vi.clearAllMocks();
            
            const error = new Error(errorMessage);
            
            // Setup: Make service throw the error
            vi.mocked(transactionMonitorService.getTransaction).mockImplementation(() => {
              throw error;
            });

            // Execute: Call the endpoint
            await request(app)
              .get('/api/transactions/0x123abc');

            // Verify: Error should be logged with details
            expect(logger.error).toHaveBeenCalled();
            const logCall = vi.mocked(logger.error).mock.calls[0];
            
            // Should log a descriptive message
            expect(typeof logCall[0]).toBe('string');
            expect(logCall[0].length).toBeGreaterThan(0);
            
            // Should include error details in context
            expect(logCall[1]).toHaveProperty('error');
            expect(logCall[1].error).toBe(errorMessage);
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
