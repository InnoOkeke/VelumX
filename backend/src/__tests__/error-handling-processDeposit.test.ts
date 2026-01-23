/**
 * Unit tests for error handling in TransactionMonitorService.processDeposit
 * Tests that exhausted retry errors are caught and transactions are marked as failed
 * 
 * Feature: xreserve-bridge-fix
 * Validates: Requirement 6.3
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BridgeTransaction } from '@shared/types';

describe('TransactionMonitorService - processDeposit Error Handling', () => {
  let service: any;
  let mockAttestationService: any;

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks();

    // Mock the attestation service
    mockAttestationService = {
      fetchXReserveAttestation: vi.fn(),
      fetchCircleAttestation: vi.fn(),
    };

    // Mock the module
    vi.doMock('../services/AttestationService', () => ({
      attestationService: mockAttestationService,
    }));

    // Import after mocking
    const { TransactionMonitorService } = await import('../services/TransactionMonitorService');
    service = new TransactionMonitorService();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('xReserve deposit error handling', () => {
    it('should mark transaction as failed when xReserve balance verification exhausts retries', async () => {
      const tx: BridgeTransaction = {
        id: 'test-xreserve-1',
        type: 'deposit',
        sourceChain: 'ethereum',
        destinationChain: 'stacks',
        amount: '5000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0x123abc',
        ethereumAddress: '0xabc123',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      // Mock exhausted retry error
      mockAttestationService.fetchXReserveAttestation.mockRejectedValue(
        new Error('xReserve balance verification not ready after 3 attempts (90s)')
      );

      // Add transaction to service
      await service.addTransaction(tx);

      // Process the deposit (this calls processDeposit internally)
      const processDeposit = service['processDeposit'].bind(service);
      await processDeposit(tx);

      // Get the updated transaction
      const updatedTx = service.getTransaction(tx.id);

      // Verify transaction was marked as failed
      expect(updatedTx?.status).toBe('failed');
      expect(updatedTx?.error).toContain('Balance verification failed');
      expect(updatedTx?.error).toContain('after 3 attempts');
    });

    it('should include attempt count in error message for xReserve', async () => {
      const tx: BridgeTransaction = {
        id: 'test-xreserve-2',
        type: 'deposit',
        sourceChain: 'ethereum',
        destinationChain: 'stacks',
        amount: '5000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0x456def',
        ethereumAddress: '0xdef456',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      // Mock exhausted retry error with specific attempt count
      mockAttestationService.fetchXReserveAttestation.mockRejectedValue(
        new Error('xReserve balance verification not ready after 5 attempts (150s)')
      );

      await service.addTransaction(tx);
      const processDeposit = service['processDeposit'].bind(service);
      await processDeposit(tx);

      const updatedTx = service.getTransaction(tx.id);

      expect(updatedTx?.status).toBe('failed');
      expect(updatedTx?.error).toContain('5 attempts');
    });

    it('should not mark transaction as failed for transient xReserve errors', async () => {
      const tx: BridgeTransaction = {
        id: 'test-xreserve-3',
        type: 'deposit',
        sourceChain: 'ethereum',
        destinationChain: 'stacks',
        amount: '5000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0x789ghi',
        ethereumAddress: '0xghi789',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      // Mock transient error (not exhausted retries)
      mockAttestationService.fetchXReserveAttestation.mockRejectedValue(
        new Error('Network timeout')
      );

      await service.addTransaction(tx);
      const processDeposit = service['processDeposit'].bind(service);
      await processDeposit(tx);

      const updatedTx = service.getTransaction(tx.id);

      // Transaction should still be in attesting state, not failed
      expect(updatedTx?.status).toBe('attesting');
      expect(updatedTx?.error).toBeUndefined();
    });
  });

  describe('CCTP deposit error handling', () => {
    it('should mark transaction as failed when Circle attestation exhausts retries', async () => {
      const tx: BridgeTransaction = {
        id: 'test-cctp-1',
        type: 'deposit',
        sourceChain: 'stacks',
        destinationChain: 'ethereum',
        amount: '5000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xabc123',
        messageHash: '0xmessage123',
        ethereumAddress: '0xabc123',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      // Mock exhausted retry error
      mockAttestationService.fetchCircleAttestation.mockRejectedValue(
        new Error('Circle attestation not ready after 3 attempts (90s)')
      );

      await service.addTransaction(tx);
      const processDeposit = service['processDeposit'].bind(service);
      await processDeposit(tx);

      const updatedTx = service.getTransaction(tx.id);

      // Verify transaction was marked as failed
      expect(updatedTx?.status).toBe('failed');
      expect(updatedTx?.error).toContain('Attestation fetch failed');
      expect(updatedTx?.error).toContain('after 3 attempts');
    });

    it('should include attempt count in error message for CCTP', async () => {
      const tx: BridgeTransaction = {
        id: 'test-cctp-2',
        type: 'deposit',
        sourceChain: 'stacks',
        destinationChain: 'ethereum',
        amount: '5000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xdef456',
        messageHash: '0xmessage456',
        ethereumAddress: '0xdef456',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      // Mock exhausted retry error with specific attempt count
      mockAttestationService.fetchCircleAttestation.mockRejectedValue(
        new Error('Circle attestation not ready after 4 attempts (120s)')
      );

      await service.addTransaction(tx);
      const processDeposit = service['processDeposit'].bind(service);
      await processDeposit(tx);

      const updatedTx = service.getTransaction(tx.id);

      expect(updatedTx?.status).toBe('failed');
      expect(updatedTx?.error).toContain('4 attempts');
    });

    it('should not mark transaction as failed for transient CCTP errors', async () => {
      const tx: BridgeTransaction = {
        id: 'test-cctp-3',
        type: 'deposit',
        sourceChain: 'stacks',
        destinationChain: 'ethereum',
        amount: '5000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xghi789',
        messageHash: '0xmessage789',
        ethereumAddress: '0xghi789',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      // Mock transient error (not exhausted retries)
      mockAttestationService.fetchCircleAttestation.mockRejectedValue(
        new Error('API rate limit exceeded')
      );

      await service.addTransaction(tx);
      const processDeposit = service['processDeposit'].bind(service);
      await processDeposit(tx);

      const updatedTx = service.getTransaction(tx.id);

      // Transaction should still be in attesting state, not failed
      expect(updatedTx?.status).toBe('attesting');
      expect(updatedTx?.error).toBeUndefined();
    });
  });

  describe('Error message format validation', () => {
    it('should detect exhausted retry errors by checking for "after" and "attempts" keywords', async () => {
      const tx: BridgeTransaction = {
        id: 'test-format-1',
        type: 'deposit',
        sourceChain: 'ethereum',
        destinationChain: 'stacks',
        amount: '5000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xformat1',
        ethereumAddress: '0xformat1',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      // Test various error message formats that should be detected
      const exhaustedRetryMessages = [
        'xReserve balance verification not ready after 3 attempts (90s)',
        'Circle attestation not ready after 5 attempts (150s)',
        'Operation failed after 10 attempts',
        'Timeout after 2 attempts',
      ];

      for (const errorMessage of exhaustedRetryMessages) {
        mockAttestationService.fetchXReserveAttestation.mockRejectedValue(
          new Error(errorMessage)
        );

        await service.addTransaction(tx);
        const processDeposit = service['processDeposit'].bind(service);
        await processDeposit(tx);

        const updatedTx = service.getTransaction(tx.id);
        expect(updatedTx?.status).toBe('failed');
        expect(updatedTx?.error).toContain(errorMessage);

        // Reset for next iteration
        await service.updateTransaction(tx.id, { status: 'attesting', error: undefined });
      }
    });

    it('should not detect non-exhausted errors as exhausted retries', async () => {
      const tx: BridgeTransaction = {
        id: 'test-format-2',
        type: 'deposit',
        sourceChain: 'ethereum',
        destinationChain: 'stacks',
        amount: '5000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xformat2',
        ethereumAddress: '0xformat2',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      // Test various error messages that should NOT be detected as exhausted retries
      const transientErrorMessages = [
        'Network timeout',
        'Connection refused',
        'API rate limit exceeded',
        'Temporary server error',
        'Balance not ready',
      ];

      for (const errorMessage of transientErrorMessages) {
        mockAttestationService.fetchXReserveAttestation.mockRejectedValue(
          new Error(errorMessage)
        );

        await service.addTransaction(tx);
        const processDeposit = service['processDeposit'].bind(service);
        await processDeposit(tx);

        const updatedTx = service.getTransaction(tx.id);
        expect(updatedTx?.status).toBe('attesting');
        expect(updatedTx?.error).toBeUndefined();

        // Reset for next iteration
        await service.updateTransaction(tx.id, { status: 'attesting' });
      }
    });
  });

  describe('Logging for exhausted retries', () => {
    it('should log error details when xReserve retries are exhausted', async () => {
      const tx: BridgeTransaction = {
        id: 'test-logging-1',
        type: 'deposit',
        sourceChain: 'ethereum',
        destinationChain: 'stacks',
        amount: '5000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xlogging1',
        ethereumAddress: '0xlogging1',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      mockAttestationService.fetchXReserveAttestation.mockRejectedValue(
        new Error('xReserve balance verification not ready after 3 attempts (90s)')
      );

      // Import logger to spy on it
      const { logger } = await import('../utils/logger');
      const errorSpy = vi.spyOn(logger, 'error');

      await service.addTransaction(tx);
      const processDeposit = service['processDeposit'].bind(service);
      await processDeposit(tx);

      // Verify error was logged with correct details
      expect(errorSpy).toHaveBeenCalledWith(
        'xReserve balance verification failed after all retries',
        expect.objectContaining({
          id: tx.id,
          recipientAddress: tx.stacksAddress,
          expectedAmount: tx.amount,
        })
      );
    });

    it('should log error details when Circle attestation retries are exhausted', async () => {
      const tx: BridgeTransaction = {
        id: 'test-logging-2',
        type: 'deposit',
        sourceChain: 'stacks',
        destinationChain: 'ethereum',
        amount: '5000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xlogging2',
        messageHash: '0xmessagelogging2',
        ethereumAddress: '0xlogging2',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      mockAttestationService.fetchCircleAttestation.mockRejectedValue(
        new Error('Circle attestation not ready after 3 attempts (90s)')
      );

      // Import logger to spy on it
      const { logger } = await import('../utils/logger');
      const errorSpy = vi.spyOn(logger, 'error');

      await service.addTransaction(tx);
      const processDeposit = service['processDeposit'].bind(service);
      await processDeposit(tx);

      // Verify error was logged with correct details
      expect(errorSpy).toHaveBeenCalledWith(
        'Circle attestation fetch failed after all retries',
        expect.objectContaining({
          id: tx.id,
          messageHash: tx.messageHash,
        })
      );
    });
  });
});
