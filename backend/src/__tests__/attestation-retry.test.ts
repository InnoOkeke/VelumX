/**
 * Unit tests for AttestationService retry mechanism
 * Tests the retryWithAttempts helper method
 * 
 * Feature: attestation-retry-fix
 * Validates: Requirements 1.3, 5.4, 6.1
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AttestationService } from '../services/AttestationService';

describe('AttestationService - retryWithAttempts', () => {
  let service: AttestationService;

  beforeEach(() => {
    service = new AttestationService();
    vi.clearAllMocks();
  });

  describe('Basic retry logic', () => {
    it('should execute exactly maxAttempts attempts when all fail', async () => {
      let attemptCount = 0;
      const operation = vi.fn(async () => {
        attemptCount++;
        return null; // Simulate "not ready"
      });

      // Use reflection to access private method for testing
      const retryMethod = (service as any).retryWithAttempts.bind(service);

      try {
        await retryMethod(
          operation,
          3, // maxAttempts
          10, // retryDelay (short for testing)
          10000, // timeout
          'Test Operation',
          'test-id'
        );
      } catch (error) {
        // Expected to throw after exhaustion
      }

      expect(attemptCount).toBe(3);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should return result on first successful attempt', async () => {
      const expectedResult = { attestation: 'test-data' };
      const operation = vi.fn(async () => expectedResult);

      const retryMethod = (service as any).retryWithAttempts.bind(service);

      const result = await retryMethod(
        operation,
        3,
        10,
        10000,
        'Test Operation',
        'test-id'
      );

      expect(result).toEqual(expectedResult);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should return result on last attempt', async () => {
      let attemptCount = 0;
      const expectedResult = { attestation: 'test-data' };
      
      const operation = vi.fn(async () => {
        attemptCount++;
        if (attemptCount === 3) {
          return expectedResult;
        }
        return null;
      });

      const retryMethod = (service as any).retryWithAttempts.bind(service);

      const result = await retryMethod(
        operation,
        3,
        10,
        10000,
        'Test Operation',
        'test-id'
      );

      expect(result).toEqual(expectedResult);
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe('Timeout handling', () => {
    it('should throw timeout error when timeout is exceeded', async () => {
      const operation = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return null;
      });

      const retryMethod = (service as any).retryWithAttempts.bind(service);

      await expect(
        retryMethod(
          operation,
          10,
          50,
          150, // Short timeout
          'Test Operation',
          'test-id'
        )
      ).rejects.toThrow('timeout');
    });
  });

  describe('Error handling', () => {
    it('should throw fatal error immediately without retry', async () => {
      let attemptCount = 0;
      const fatalError = new Error('Fatal error: 500 Internal Server Error');
      
      const operation = vi.fn(async () => {
        attemptCount++;
        throw fatalError;
      });

      const retryMethod = (service as any).retryWithAttempts.bind(service);

      await expect(
        retryMethod(
          operation,
          3,
          10,
          10000,
          'Test Operation',
          'test-id'
        )
      ).rejects.toThrow('Fatal error');

      expect(attemptCount).toBe(1);
    });

    it('should retry on 404 errors', async () => {
      let attemptCount = 0;
      const retryableError = new Error('404 Not Found');
      
      const operation = vi.fn(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw retryableError;
        }
        return { attestation: 'success' };
      });

      const retryMethod = (service as any).retryWithAttempts.bind(service);

      const result = await retryMethod(
        operation,
        3,
        10,
        10000,
        'Test Operation',
        'test-id'
      );

      expect(result).toEqual({ attestation: 'success' });
      expect(attemptCount).toBe(3);
    });
  });

  describe('Edge cases', () => {
    it('should handle maxAttempts = 1', async () => {
      let attemptCount = 0;
      const operation = vi.fn(async () => {
        attemptCount++;
        return null;
      });

      const retryMethod = (service as any).retryWithAttempts.bind(service);

      try {
        await retryMethod(
          operation,
          1,
          10,
          10000,
          'Test Operation',
          'test-id'
        );
      } catch (error) {
        // Expected
      }

      expect(attemptCount).toBe(1);
    });
  });

  describe('Input validation for maxAttempts', () => {
    it('should coerce negative maxAttempts to default (3)', async () => {
      const validateMethod = (service as any).validateMaxAttempts.bind(service);
      const result = validateMethod(-5, 'testMethod');
      expect(result).toBe(3);
    });

    it('should coerce non-integer maxAttempts to default (3)', async () => {
      const validateMethod = (service as any).validateMaxAttempts.bind(service);
      const result = validateMethod(2.5, 'testMethod');
      expect(result).toBe(3);
    });

    it('should coerce null maxAttempts to default (3)', async () => {
      const validateMethod = (service as any).validateMaxAttempts.bind(service);
      const result = validateMethod(null as any, 'testMethod');
      expect(result).toBe(3);
    });

    it('should coerce undefined maxAttempts to default (3)', async () => {
      const validateMethod = (service as any).validateMaxAttempts.bind(service);
      const result = validateMethod(undefined as any, 'testMethod');
      expect(result).toBe(3);
    });

    it('should coerce NaN maxAttempts to default (3)', async () => {
      const validateMethod = (service as any).validateMaxAttempts.bind(service);
      const result = validateMethod(NaN, 'testMethod');
      expect(result).toBe(3);
    });

    it('should accept valid positive integer maxAttempts', async () => {
      const validateMethod = (service as any).validateMaxAttempts.bind(service);
      const result = validateMethod(5, 'testMethod');
      expect(result).toBe(5);
    });

    it('should accept zero as valid maxAttempts', async () => {
      const validateMethod = (service as any).validateMaxAttempts.bind(service);
      const result = validateMethod(0, 'testMethod');
      expect(result).toBe(0);
    });

    it('should coerce non-number types to default (3)', async () => {
      const validateMethod = (service as any).validateMaxAttempts.bind(service);
      const result = validateMethod('5' as any, 'testMethod');
      expect(result).toBe(3);
    });
  });

  describe('Integration: validation in attestation methods', () => {
    it('should validate maxAttempts in fetchCircleAttestation', async () => {
      // Mock the fetchFromCircleAPI to avoid actual API calls
      vi.spyOn(service as any, 'fetchFromCircleAPI').mockResolvedValue({
        attestation: 'test-attestation',
      });

      // Call with invalid maxRetries (negative)
      const result = await service.fetchCircleAttestation('0x' + 'a'.repeat(64), {
        maxRetries: -1,
        retryDelay: 10,
        timeout: 1000,
      });

      // Should succeed because validation coerces to default
      expect(result).toBeDefined();
      expect(result.attestation).toBe('test-attestation');
    });

    it('should validate maxAttempts in fetchXReserveAttestation', async () => {
      // Mock the fetchStacksBalance to avoid actual API calls
      vi.spyOn(service as any, 'fetchStacksBalance').mockResolvedValue(BigInt('1000000'));
      vi.spyOn(service as any, 'verifyBalanceIncrease').mockReturnValue(true);

      // Call with invalid maxRetries (non-integer)
      const result = await service.fetchXReserveAttestation('0x' + 'a'.repeat(64), 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM', '1000000', {
        maxRetries: 2.7,
        retryDelay: 10,
        timeout: 1000,
      });

      // Should succeed because validation coerces to default
      expect(result).toBeDefined();
      expect(result.attestation).toBe('xreserve-automatic');
    });

    it('should validate maxAttempts in fetchStacksAttestation', async () => {
      // Mock the fetchFromStacksAPI to avoid actual API calls
      vi.spyOn(service as any, 'fetchFromStacksAPI').mockResolvedValue({
        attestation: 'test-attestation',
        messageHash: '0x' + 'a'.repeat(64),
      });

      // Call with invalid maxRetries (NaN)
      const result = await service.fetchStacksAttestation('0x' + 'a'.repeat(64), {
        maxRetries: NaN,
        retryDelay: 10,
        timeout: 1000,
      });

      // Should succeed because validation coerces to default
      expect(result).toBeDefined();
      expect(result.attestation).toBe('test-attestation');
    });
  });

  describe('Error classification - isRetryableError', () => {
    it('should classify 404 errors as retryable', () => {
      const error = new Error('404 Not Found');
      const isRetryable = (service as any).isRetryableError(error);
      expect(isRetryable).toBe(true);
    });

    it('should classify "not found" errors as retryable', () => {
      const error = new Error('Resource not found');
      const isRetryable = (service as any).isRetryableError(error);
      expect(isRetryable).toBe(true);
    });

    it('should classify timeout errors as retryable', () => {
      const error = new Error('Request timeout');
      const isRetryable = (service as any).isRetryableError(error);
      expect(isRetryable).toBe(true);
    });

    it('should classify network errors as retryable', () => {
      const error = new Error('Network error occurred');
      const isRetryable = (service as any).isRetryableError(error);
      expect(isRetryable).toBe(true);
    });

    it('should classify 429 rate limit errors as retryable', () => {
      const error = new Error('429 Too Many Requests');
      const isRetryable = (service as any).isRetryableError(error);
      expect(isRetryable).toBe(true);
    });

    it('should classify rate limit errors as retryable', () => {
      const error = new Error('Rate limit exceeded');
      const isRetryable = (service as any).isRetryableError(error);
      expect(isRetryable).toBe(true);
    });

    it('should classify 401 errors as permanent (not retryable)', () => {
      const error = new Error('401 Unauthorized');
      const isRetryable = (service as any).isRetryableError(error);
      expect(isRetryable).toBe(false);
    });

    it('should classify unauthorized errors as permanent', () => {
      const error = new Error('Unauthorized access');
      const isRetryable = (service as any).isRetryableError(error);
      expect(isRetryable).toBe(false);
    });

    it('should classify 403 errors as permanent', () => {
      const error = new Error('403 Forbidden');
      const isRetryable = (service as any).isRetryableError(error);
      expect(isRetryable).toBe(false);
    });

    it('should classify forbidden errors as permanent', () => {
      const error = new Error('Access forbidden');
      const isRetryable = (service as any).isRetryableError(error);
      expect(isRetryable).toBe(false);
    });

    it('should classify 500 errors as permanent', () => {
      const error = new Error('500 Internal Server Error');
      const isRetryable = (service as any).isRetryableError(error);
      expect(isRetryable).toBe(false);
    });

    it('should classify internal server errors as permanent', () => {
      const error = new Error('Internal server error occurred');
      const isRetryable = (service as any).isRetryableError(error);
      expect(isRetryable).toBe(false);
    });

    it('should classify validation errors as permanent', () => {
      const error = new Error('Validation error: invalid input');
      const isRetryable = (service as any).isRetryableError(error);
      expect(isRetryable).toBe(false);
    });

    it('should classify invalid errors as permanent', () => {
      const error = new Error('Invalid request format');
      const isRetryable = (service as any).isRetryableError(error);
      expect(isRetryable).toBe(false);
    });

    it('should handle case-insensitive error messages', () => {
      const error1 = new Error('404 NOT FOUND');
      const error2 = new Error('TIMEOUT ERROR');
      const error3 = new Error('401 UNAUTHORIZED');
      
      expect((service as any).isRetryableError(error1)).toBe(true);
      expect((service as any).isRetryableError(error2)).toBe(true);
      expect((service as any).isRetryableError(error3)).toBe(false);
    });

    it('should return false for unknown error types', () => {
      const error = new Error('Some unknown error');
      const isRetryable = (service as any).isRetryableError(error);
      expect(isRetryable).toBe(false);
    });

    it('should prioritize permanent classification over retryable', () => {
      // Error message contains both retryable (404) and permanent (500) patterns
      const error = new Error('404 Not Found but 500 Internal Server Error');
      const isRetryable = (service as any).isRetryableError(error);
      // Should be classified as permanent because permanent takes precedence
      expect(isRetryable).toBe(false);
    });
  });
});
