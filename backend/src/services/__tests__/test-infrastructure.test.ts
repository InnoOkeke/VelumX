/**
 * Test Infrastructure Verification
 * 
 * This test file verifies that the testing infrastructure is properly set up:
 * - fast-check library is available for property-based testing
 * - Vitest fake timers work correctly
 * - Logger mocking utilities function as expected
 * 
 * Feature: attestation-retry-fix
 * Task: 1. Set up testing infrastructure
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  createMockLogger,
  setupFakeTimers,
  createMockFetchResponse,
  createMockAttestationResponse,
  verifyAttemptLogFormat,
  generateMessageHash,
  type LogEntry,
} from './test-utils';

describe('Testing Infrastructure', () => {
  describe('fast-check library', () => {
    it('should be available for property-based testing', () => {
      // Verify fast-check is imported and functional
      expect(fc).toBeDefined();
      expect(fc.assert).toBeDefined();
      expect(fc.property).toBeDefined();
      expect(fc.integer).toBeDefined();
    });

    it('should generate random integers', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          (n) => {
            expect(n).toBeGreaterThanOrEqual(1);
            expect(n).toBeLessThanOrEqual(100);
            return true;
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should support async properties', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          async (n) => {
            // Simulate async operation
            await new Promise(resolve => setTimeout(resolve, 1));
            expect(n).toBeGreaterThan(0);
            return true;
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Vitest fake timers', () => {
    let cleanup: () => void;

    afterEach(() => {
      if (cleanup) cleanup();
    });

    it('should control time progression', () => {
      const { advance, cleanup: cleanupTimers } = setupFakeTimers();
      cleanup = cleanupTimers;

      let called = false;
      setTimeout(() => {
        called = true;
      }, 1000);

      expect(called).toBe(false);
      
      advance(500);
      expect(called).toBe(false);
      
      advance(500);
      expect(called).toBe(true);
    });

    it('should handle multiple timers', () => {
      const { advance, cleanup: cleanupTimers } = setupFakeTimers();
      cleanup = cleanupTimers;

      const calls: number[] = [];
      
      setTimeout(() => calls.push(1), 100);
      setTimeout(() => calls.push(2), 200);
      setTimeout(() => calls.push(3), 300);

      advance(150);
      expect(calls).toEqual([1]);

      advance(100);
      expect(calls).toEqual([1, 2]);

      advance(100);
      expect(calls).toEqual([1, 2, 3]);
    });

    it('should work with Date.now()', () => {
      const { advance, cleanup: cleanupTimers } = setupFakeTimers();
      cleanup = cleanupTimers;

      const start = Date.now();
      advance(5000);
      const end = Date.now();

      expect(end - start).toBe(5000);
    });
  });

  describe('Logger mocking utilities', () => {
    let mockLogger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
      mockLogger = createMockLogger();
    });

    it('should capture log messages', () => {
      mockLogger.info('Test message', { key: 'value' });
      mockLogger.warn('Warning message');
      mockLogger.error('Error message');

      const logs = mockLogger.getLogs();
      expect(logs).toHaveLength(3);
      expect(logs[0].level).toBe('info');
      expect(logs[0].message).toBe('Test message');
      expect(logs[0].metadata).toEqual({ key: 'value' });
    });

    it('should filter logs by level', () => {
      mockLogger.info('Info 1');
      mockLogger.warn('Warning 1');
      mockLogger.info('Info 2');
      mockLogger.error('Error 1');

      const infoLogs = mockLogger.getLogsByLevel('info');
      expect(infoLogs).toHaveLength(2);
      expect(infoLogs[0].message).toBe('Info 1');
      expect(infoLogs[1].message).toBe('Info 2');
    });

    it('should filter logs by message pattern', () => {
      mockLogger.info('Attempt 1/3');
      mockLogger.info('Attempt 2/3');
      mockLogger.info('Different message');
      mockLogger.info('Attempt 3/3');

      const attemptLogs = mockLogger.getLogsByMessage('Attempt');
      expect(attemptLogs).toHaveLength(3);

      const regexLogs = mockLogger.getLogsByMessage(/Attempt \d+\/\d+/);
      expect(regexLogs).toHaveLength(3);
    });

    it('should check if specific log exists', () => {
      mockLogger.info('Circle attestation not ready yet, will retry');
      mockLogger.warn('Retry limit reached');

      expect(mockLogger.hasLog('info', 'will retry')).toBe(true);
      expect(mockLogger.hasLog('warn', 'Retry limit reached')).toBe(true);
      expect(mockLogger.hasLog('error', 'will retry')).toBe(false);
    });

    it('should count logs matching criteria', () => {
      mockLogger.info('Attempt 1/3');
      mockLogger.info('Attempt 2/3');
      mockLogger.warn('Attempt 3/3');
      mockLogger.info('Different message');

      expect(mockLogger.countLogs()).toBe(4);
      expect(mockLogger.countLogs('info')).toBe(3);
      expect(mockLogger.countLogs(undefined, 'Attempt')).toBe(3);
      expect(mockLogger.countLogs('info', 'Attempt')).toBe(2);
    });

    it('should get logs with specific metadata', () => {
      mockLogger.info('Message 1', { attempt: 1, maxAttempts: 3 });
      mockLogger.info('Message 2', { attempt: 2, maxAttempts: 3 });
      mockLogger.info('Message 3', { attempt: 3 });

      const logsWithMaxAttempts = mockLogger.getLogsWithMetadata('maxAttempts');
      expect(logsWithMaxAttempts).toHaveLength(2);

      const logsWithMaxAttempts3 = mockLogger.getLogsWithMetadata('maxAttempts', 3);
      expect(logsWithMaxAttempts3).toHaveLength(2);
    });

    it('should clear logs', () => {
      mockLogger.info('Message 1');
      mockLogger.info('Message 2');
      expect(mockLogger.getLogs()).toHaveLength(2);

      mockLogger.clear();
      expect(mockLogger.getLogs()).toHaveLength(0);
    });

    it('should get last log', () => {
      mockLogger.info('First');
      mockLogger.warn('Second');
      mockLogger.error('Third');

      const lastLog = mockLogger.getLastLog();
      expect(lastLog?.level).toBe('error');
      expect(lastLog?.message).toBe('Third');
    });
  });

  describe('Test helper utilities', () => {
    it('should create mock fetch responses', () => {
      const successResponse = createMockFetchResponse(200, { data: 'test' });
      expect(successResponse.ok).toBe(true);
      expect(successResponse.status).toBe(200);

      const errorResponse = createMockFetchResponse(404, null, 'Not Found');
      expect(errorResponse.ok).toBe(false);
      expect(errorResponse.status).toBe(404);
    });

    it('should create mock attestation responses', () => {
      const readyResponse = createMockAttestationResponse('0xabc123');
      expect(readyResponse.attestation).toBe('0xabc123');
      expect(readyResponse.status).toBe('complete');

      const pendingResponse = createMockAttestationResponse(null);
      expect(pendingResponse.attestation).toBeNull();
      expect(pendingResponse.status).toBe('pending');
    });

    it('should verify attempt log format', () => {
      const validLog: LogEntry = {
        level: 'info',
        message: 'Fetching attestation',
        metadata: { attempt: 2, maxAttempts: 5 },
      };

      expect(verifyAttemptLogFormat(validLog, 2, 5)).toBe(true);
      expect(verifyAttemptLogFormat(validLog, 1, 5)).toBe(false);
      expect(verifyAttemptLogFormat(validLog, 2, 3)).toBe(false);
    });

    it('should generate valid message hashes', () => {
      const hash1 = generateMessageHash(0.5);
      expect(hash1).toMatch(/^0x[a-fA-F0-9]{64}$/);

      const hash2 = generateMessageHash(0.7);
      expect(hash2).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(hash2).not.toBe(hash1);
    });
  });

  describe('Integration: Logger + Fake Timers', () => {
    let mockLogger: ReturnType<typeof createMockLogger>;
    let cleanup: () => void;

    beforeEach(() => {
      mockLogger = createMockLogger();
      const { cleanup: cleanupTimers } = setupFakeTimers();
      cleanup = cleanupTimers;
    });

    afterEach(() => {
      if (cleanup) cleanup();
    });

    it('should track logs over time', () => {
      const startTime = Date.now();

      setTimeout(() => {
        mockLogger.info('Attempt 1', { time: Date.now() - startTime });
      }, 1000);

      setTimeout(() => {
        mockLogger.info('Attempt 2', { time: Date.now() - startTime });
      }, 2000);

      setTimeout(() => {
        mockLogger.info('Attempt 3', { time: Date.now() - startTime });
      }, 3000);

      vi.advanceTimersByTime(3500);

      const logs = mockLogger.getLogs();
      expect(logs).toHaveLength(3);
      expect(logs[0].metadata?.time).toBe(1000);
      expect(logs[1].metadata?.time).toBe(2000);
      expect(logs[2].metadata?.time).toBe(3000);
    });
  });

  describe('Property-based testing with test utilities', () => {
    it('should verify attempt count property with random values', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          (maxAttempts) => {
            const mockLogger = createMockLogger();
            
            // Simulate retry loop
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
              mockLogger.info('Attempt', { attempt, maxAttempts });
            }

            const logs = mockLogger.getLogs();
            expect(logs).toHaveLength(maxAttempts);
            
            // Verify each log has correct attempt number
            logs.forEach((log, index) => {
              expect(log.metadata?.attempt).toBe(index + 1);
              expect(log.metadata?.maxAttempts).toBe(maxAttempts);
            });

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should verify "will retry" logging accuracy', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }),
          (maxAttempts) => {
            const mockLogger = createMockLogger();
            
            // Simulate retry loop with "will retry" logging
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
              mockLogger.info('Attempt', { attempt, maxAttempts });
              
              const hasMoreAttempts = attempt < maxAttempts;
              if (hasMoreAttempts) {
                mockLogger.info('will retry', { attempt, maxAttempts });
              }
            }

            const willRetryLogs = mockLogger.getLogsByMessage('will retry');
            
            // "will retry" should appear exactly (maxAttempts - 1) times
            expect(willRetryLogs).toHaveLength(maxAttempts - 1);

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
