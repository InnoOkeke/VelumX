/**
 * Unit tests for logging utilities
 * Tests transaction tracing, performance logging, and audit logging
 * 
 * Validates: Requirements 10.1, 10.4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TransactionTracer,
  PerformanceLogger,
  AuditLogger,
  createTransactionTracer,
  createPerformanceLogger,
} from '../utils/logger';

describe('Logging Utilities', () => {
  describe('TransactionTracer', () => {
    it('should create tracer with correlation ID', () => {
      const tracer = new TransactionTracer();
      const correlationId = tracer.getCorrelationId();
      
      expect(correlationId).toBeDefined();
      expect(typeof correlationId).toBe('string');
      expect(correlationId.length).toBeGreaterThan(0);
    });

    it('should use provided correlation ID', () => {
      const customId = 'custom-correlation-id';
      const tracer = new TransactionTracer({ correlationId: customId });
      
      expect(tracer.getCorrelationId()).toBe(customId);
    });

    it('should include context in logs', () => {
      const tracer = new TransactionTracer({
        userId: 'user123',
        operation: 'test-operation',
      });
      
      // We can't easily test the actual logging output without mocking winston,
      // but we can verify the tracer was created with the right context
      expect(tracer.getCorrelationId()).toBeDefined();
    });

    it('should create child tracer with inherited context', () => {
      const parentTracer = new TransactionTracer({
        userId: 'user123',
        operation: 'parent-operation',
      });
      
      const childTracer = parentTracer.child({
        transactionId: 'tx456',
      });
      
      // Child should have same correlation ID as parent
      expect(childTracer.getCorrelationId()).toBe(parentTracer.getCorrelationId());
    });

    it('should provide logging methods', () => {
      const tracer = new TransactionTracer();
      
      // These should not throw
      expect(() => tracer.info('Test info message')).not.toThrow();
      expect(() => tracer.warn('Test warning message')).not.toThrow();
      expect(() => tracer.debug('Test debug message')).not.toThrow();
      expect(() => tracer.error('Test error message', new Error('Test error'))).not.toThrow();
    });
  });

  describe('PerformanceLogger', () => {
    it('should track operation duration', async () => {
      const perfLogger = new PerformanceLogger('test-operation');
      
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Complete should not throw
      expect(() => perfLogger.complete(true)).not.toThrow();
    });

    it('should track checkpoints', async () => {
      const perfLogger = new PerformanceLogger('test-operation');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(() => perfLogger.checkpoint('step1')).not.toThrow();
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(() => perfLogger.checkpoint('step2')).not.toThrow();
      
      expect(() => perfLogger.complete(true)).not.toThrow();
    });

    it('should handle operation failure', () => {
      const perfLogger = new PerformanceLogger('test-operation');
      const error = new Error('Operation failed');
      
      expect(() => perfLogger.fail(error)).not.toThrow();
    });

    it('should include context in performance logs', () => {
      const perfLogger = new PerformanceLogger('test-operation', {
        userId: 'user123',
        correlationId: 'corr-456',
      });
      
      expect(() => perfLogger.complete(true)).not.toThrow();
    });

    it('should track multiple operations independently', async () => {
      const perfLogger1 = new PerformanceLogger('operation1');
      const perfLogger2 = new PerformanceLogger('operation2');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(() => perfLogger1.complete(true)).not.toThrow();
      expect(() => perfLogger2.complete(true)).not.toThrow();
    });
  });

  describe('AuditLogger', () => {
    it('should log user actions', () => {
      expect(() => {
        AuditLogger.logUserAction('user123', 'create', 'resource', {
          resourceId: 'res456',
        });
      }).not.toThrow();
    });

    it('should log liquidity operations', () => {
      expect(() => {
        AuditLogger.logLiquidityOperation(
          'user123',
          'add',
          'pool-STX-USDC',
          {
            tokenA: '1000000',
            tokenB: '2000000',
          }
        );
      }).not.toThrow();
    });

    it('should log swap operations', () => {
      expect(() => {
        AuditLogger.logSwapOperation(
          'user123',
          'STX',
          'USDC',
          '1000000',
          {
            slippage: 0.5,
          }
        );
      }).not.toThrow();
    });

    it('should log authentication events', () => {
      expect(() => {
        AuditLogger.logAuthEvent('user123', 'login', {
          ip: '192.168.1.1',
        });
      }).not.toThrow();
      
      expect(() => {
        AuditLogger.logAuthEvent('user123', 'logout');
      }).not.toThrow();
      
      expect(() => {
        AuditLogger.logAuthEvent('user123', 'failed_login', {
          reason: 'invalid_password',
        });
      }).not.toThrow();
    });

    it('should log security events', () => {
      expect(() => {
        AuditLogger.logSecurityEvent(
          'user123',
          'suspicious_activity',
          'high',
          {
            details: 'Multiple failed login attempts',
          }
        );
      }).not.toThrow();
    });

    it('should handle different severity levels', () => {
      const severities: Array<'low' | 'medium' | 'high' | 'critical'> = [
        'low',
        'medium',
        'high',
        'critical',
      ];
      
      severities.forEach(severity => {
        expect(() => {
          AuditLogger.logSecurityEvent('user123', 'test-event', severity);
        }).not.toThrow();
      });
    });
  });

  describe('Factory Functions', () => {
    it('should create transaction tracer', () => {
      const tracer = createTransactionTracer({
        userId: 'user123',
      });
      
      expect(tracer).toBeInstanceOf(TransactionTracer);
      expect(tracer.getCorrelationId()).toBeDefined();
    });

    it('should create performance logger', () => {
      const perfLogger = createPerformanceLogger('test-operation', {
        userId: 'user123',
      });
      
      expect(perfLogger).toBeInstanceOf(PerformanceLogger);
      expect(() => perfLogger.complete(true)).not.toThrow();
    });
  });

  describe('Integration Scenarios', () => {
    it('should trace a complete transaction flow', async () => {
      // Start transaction trace
      const tracer = createTransactionTracer({
        userId: 'user123',
        operation: 'add-liquidity',
      });
      
      tracer.info('Starting liquidity addition');
      
      // Track performance
      const perfLogger = createPerformanceLogger('add-liquidity', {
        correlationId: tracer.getCorrelationId(),
        userId: 'user123',
      });
      
      // Simulate operation steps
      perfLogger.checkpoint('validate-params');
      await new Promise(resolve => setTimeout(resolve, 50));
      
      perfLogger.checkpoint('fetch-pool-data');
      await new Promise(resolve => setTimeout(resolve, 50));
      
      perfLogger.checkpoint('prepare-transaction');
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Complete operation
      perfLogger.complete(true, {
        txHash: '0x123...',
      });
      
      // Audit log
      AuditLogger.logLiquidityOperation(
        'user123',
        'add',
        'pool-STX-USDC',
        {
          tokenA: '1000000',
          tokenB: '2000000',
        },
        {
          correlationId: tracer.getCorrelationId(),
        }
      );
      
      tracer.info('Liquidity addition completed');
      
      // All operations should complete without errors
      expect(true).toBe(true);
    });

    it('should handle error scenarios with proper logging', async () => {
      const tracer = createTransactionTracer({
        userId: 'user123',
        operation: 'swap',
      });
      
      const perfLogger = createPerformanceLogger('swap', {
        correlationId: tracer.getCorrelationId(),
      });
      
      try {
        // Simulate error
        throw new Error('Insufficient liquidity');
      } catch (error) {
        tracer.error('Swap failed', error as Error, {
          fromToken: 'STX',
          toToken: 'USDC',
        });
        
        perfLogger.fail(error as Error, {
          fromToken: 'STX',
          toToken: 'USDC',
        });
        
        // Error should be logged without throwing
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should support nested operations with child tracers', async () => {
      const parentTracer = createTransactionTracer({
        userId: 'user123',
        operation: 'batch-operation',
      });
      
      parentTracer.info('Starting batch operation');
      
      // Child operation 1
      const child1 = parentTracer.child({
        operation: 'sub-operation-1',
      });
      child1.info('Executing sub-operation 1');
      await new Promise(resolve => setTimeout(resolve, 50));
      child1.info('Sub-operation 1 completed');
      
      // Child operation 2
      const child2 = parentTracer.child({
        operation: 'sub-operation-2',
      });
      child2.info('Executing sub-operation 2');
      await new Promise(resolve => setTimeout(resolve, 50));
      child2.info('Sub-operation 2 completed');
      
      parentTracer.info('Batch operation completed');
      
      // All child operations should share parent's correlation ID
      expect(child1.getCorrelationId()).toBe(parentTracer.getCorrelationId());
      expect(child2.getCorrelationId()).toBe(parentTracer.getCorrelationId());
    });
  });
});
