/**
 * Unit tests for Stacks withdrawal flow (backward compatibility)
 * Tests that withdrawals (Stacks→Ethereum) continue to work correctly
 * 
 * Feature: xreserve-bridge-fix
 * Task: 4.2 Add unit tests for Stacks withdrawal flow
 * Validates: Requirements 5.2
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BridgeTransaction } from '@shared/types';

describe('TransactionMonitorService - Stacks Withdrawal Flow', () => {
  let service: any;

  beforeEach(async () => {
    const { TransactionMonitorService } = await import('../services/TransactionMonitorService');
    service = new TransactionMonitorService();
    vi.clearAllMocks();
  });

  describe('Withdrawals call fetchStacksAttestation', () => {
    it('should call fetchStacksAttestation for Stacks→Ethereum withdrawals', async () => {
      const withdrawalTx: BridgeTransaction = {
        id: 'withdrawal-test-1',
        type: 'withdrawal',
        sourceChain: 'stacks',
        destinationChain: 'ethereum',
        amount: '1000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xstacks-withdrawal-1',
        ethereumAddress: '0xabc',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      const attestationService = await import('../services/AttestationService');
      const fetchStacksSpy = vi.spyOn(attestationService.attestationService, 'fetchStacksAttestation')
        .mockResolvedValue({
          attestation: '0xstacks-attestation-data',
          messageHash: '0xstacks-message-hash',
          fetchedAt: Date.now(),
        });

      await service.addTransaction(withdrawalTx);
      await service['processWithdrawal'](withdrawalTx);

      // Verify fetchStacksAttestation was called with sourceTxHash
      expect(fetchStacksSpy).toHaveBeenCalledWith('0xstacks-withdrawal-1');

      fetchStacksSpy.mockRestore();
    });

    it('should not call fetchXReserveAttestation for withdrawals', async () => {
      const withdrawalTx: BridgeTransaction = {
        id: 'withdrawal-test-2',
        type: 'withdrawal',
        sourceChain: 'stacks',
        destinationChain: 'ethereum',
        amount: '2000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xstacks-withdrawal-2',
        ethereumAddress: '0xdef',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      const attestationService = await import('../services/AttestationService');
      
      const fetchStacksSpy = vi.spyOn(attestationService.attestationService, 'fetchStacksAttestation')
        .mockResolvedValue({
          attestation: '0xstacks-attestation',
          messageHash: '0xstacks-message',
          fetchedAt: Date.now(),
        });
      
      const fetchXReserveSpy = vi.spyOn(attestationService.attestationService, 'fetchXReserveAttestation')
        .mockResolvedValue({
          attestation: 'xreserve-automatic',
          messageHash: '0xshould-not-be-called',
          fetchedAt: Date.now(),
        });

      await service.addTransaction(withdrawalTx);
      await service['processWithdrawal'](withdrawalTx);

      // Verify only Stacks attestation was called, not xReserve
      expect(fetchStacksSpy).toHaveBeenCalled();
      expect(fetchXReserveSpy).not.toHaveBeenCalled();

      fetchStacksSpy.mockRestore();
      fetchXReserveSpy.mockRestore();
    });

    it('should not call fetchCircleAttestation for withdrawals', async () => {
      const withdrawalTx: BridgeTransaction = {
        id: 'withdrawal-test-3',
        type: 'withdrawal',
        sourceChain: 'stacks',
        destinationChain: 'ethereum',
        amount: '3000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xstacks-withdrawal-3',
        ethereumAddress: '0xghi',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      const attestationService = await import('../services/AttestationService');
      
      const fetchStacksSpy = vi.spyOn(attestationService.attestationService, 'fetchStacksAttestation')
        .mockResolvedValue({
          attestation: '0xstacks-attestation',
          messageHash: '0xstacks-message',
          fetchedAt: Date.now(),
        });
      
      const fetchCircleSpy = vi.spyOn(attestationService.attestationService, 'fetchCircleAttestation')
        .mockResolvedValue({
          attestation: '0xcircle-should-not-be-called',
          messageHash: '0xcircle-message',
          fetchedAt: Date.now(),
        });

      await service.addTransaction(withdrawalTx);
      await service['processWithdrawal'](withdrawalTx);

      // Verify only Stacks attestation was called, not Circle
      expect(fetchStacksSpy).toHaveBeenCalled();
      expect(fetchCircleSpy).not.toHaveBeenCalled();

      fetchStacksSpy.mockRestore();
      fetchCircleSpy.mockRestore();
    });

    it('should pass correct transaction hash to fetchStacksAttestation', async () => {
      const txHash = '0x' + 'a'.repeat(64);
      const withdrawalTx: BridgeTransaction = {
        id: 'withdrawal-test-4',
        type: 'withdrawal',
        sourceChain: 'stacks',
        destinationChain: 'ethereum',
        amount: '5000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: txHash,
        ethereumAddress: '0xjkl',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      const attestationService = await import('../services/AttestationService');
      const fetchStacksSpy = vi.spyOn(attestationService.attestationService, 'fetchStacksAttestation')
        .mockResolvedValue({
          attestation: '0xstacks-attestation',
          messageHash: '0xstacks-message',
          fetchedAt: Date.now(),
        });

      await service.addTransaction(withdrawalTx);
      await service['processWithdrawal'](withdrawalTx);

      // Verify correct transaction hash was passed
      expect(fetchStacksSpy).toHaveBeenCalledWith(txHash);

      fetchStacksSpy.mockRestore();
    });
  });

  describe('Withdrawal flow remains unchanged', () => {
    it('should transition from pending to attesting state', async () => {
      const withdrawalTx: BridgeTransaction = {
        id: 'withdrawal-test-5',
        type: 'withdrawal',
        sourceChain: 'stacks',
        destinationChain: 'ethereum',
        amount: '1000000',
        status: 'pending',
        currentStep: 'burn',
        sourceTxHash: '0xstacks-pending',
        ethereumAddress: '0xmno',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      await service.addTransaction(withdrawalTx);
      await service['processWithdrawal'](withdrawalTx);

      const updatedTx = service.getTransaction('withdrawal-test-5');
      expect(updatedTx.status).toBe('attesting');
      expect(updatedTx.currentStep).toBe('attestation');
    });

    it('should transition from confirming to attesting state', async () => {
      const withdrawalTx: BridgeTransaction = {
        id: 'withdrawal-test-6',
        type: 'withdrawal',
        sourceChain: 'stacks',
        destinationChain: 'ethereum',
        amount: '2000000',
        status: 'confirming',
        currentStep: 'burn',
        sourceTxHash: '0xstacks-confirming',
        ethereumAddress: '0xpqr',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      await service.addTransaction(withdrawalTx);
      await service['processWithdrawal'](withdrawalTx);

      const updatedTx = service.getTransaction('withdrawal-test-6');
      expect(updatedTx.status).toBe('attesting');
      expect(updatedTx.currentStep).toBe('attestation');
    });

    it('should transition from attesting to minting after attestation fetch', async () => {
      const withdrawalTx: BridgeTransaction = {
        id: 'withdrawal-test-7',
        type: 'withdrawal',
        sourceChain: 'stacks',
        destinationChain: 'ethereum',
        amount: '3000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xstacks-attesting',
        ethereumAddress: '0xstu',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      const attestationService = await import('../services/AttestationService');
      vi.spyOn(attestationService.attestationService, 'fetchStacksAttestation')
        .mockResolvedValue({
          attestation: '0xstacks-attestation-complete',
          messageHash: '0xstacks-message-complete',
          fetchedAt: Date.now(),
        });

      await service.addTransaction(withdrawalTx);
      await service['processWithdrawal'](withdrawalTx);

      const updatedTx = service.getTransaction('withdrawal-test-7');
      expect(updatedTx.status).toBe('minting');
      expect(updatedTx.currentStep).toBe('withdrawal');
      expect(updatedTx.attestation).toBe('0xstacks-attestation-complete');
      expect(updatedTx.messageHash).toBe('0xstacks-message-complete');
    });

    it('should transition from minting to complete', async () => {
      const withdrawalTx: BridgeTransaction = {
        id: 'withdrawal-test-8',
        type: 'withdrawal',
        sourceChain: 'stacks',
        destinationChain: 'ethereum',
        amount: '4000000',
        status: 'minting',
        currentStep: 'withdrawal',
        sourceTxHash: '0xstacks-minting',
        attestation: '0xstacks-attestation',
        messageHash: '0xstacks-message',
        attestationFetchedAt: Date.now(),
        ethereumAddress: '0xvwx',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      await service.addTransaction(withdrawalTx);
      await service['processWithdrawal'](withdrawalTx);

      const updatedTx = service.getTransaction('withdrawal-test-8');
      expect(updatedTx.status).toBe('complete');
      expect(updatedTx.completedAt).toBeDefined();
    });

    it('should store attestation data correctly', async () => {
      const fetchedAt = Date.now();
      const withdrawalTx: BridgeTransaction = {
        id: 'withdrawal-test-9',
        type: 'withdrawal',
        sourceChain: 'stacks',
        destinationChain: 'ethereum',
        amount: '5000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xstacks-store-data',
        ethereumAddress: '0xyzabc',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      const attestationService = await import('../services/AttestationService');
      vi.spyOn(attestationService.attestationService, 'fetchStacksAttestation')
        .mockResolvedValue({
          attestation: '0xstacks-attestation-stored',
          messageHash: '0xstacks-message-stored',
          fetchedAt,
        });

      await service.addTransaction(withdrawalTx);
      await service['processWithdrawal'](withdrawalTx);

      const updatedTx = service.getTransaction('withdrawal-test-9');
      
      // Verify all attestation data was stored correctly
      expect(updatedTx.attestation).toBe('0xstacks-attestation-stored');
      expect(updatedTx.messageHash).toBe('0xstacks-message-stored');
      expect(updatedTx.attestationFetchedAt).toBe(fetchedAt);
      expect(updatedTx.status).toBe('minting');
    });

    it('should handle timeout for withdrawal transactions', async () => {
      const oldTimestamp = Date.now() - (2 * 60 * 60 * 1000); // 2 hours ago
      const withdrawalTx: BridgeTransaction = {
        id: 'withdrawal-test-10',
        type: 'withdrawal',
        sourceChain: 'stacks',
        destinationChain: 'ethereum',
        amount: '1000000',
        status: 'pending',
        currentStep: 'burn',
        sourceTxHash: '0xstacks-timeout',
        ethereumAddress: '0xdefghi',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: oldTimestamp,
        updatedAt: oldTimestamp,
        retryCount: 0,
        isGasless: false,
      };

      await service.addTransaction(withdrawalTx);
      await service['processWithdrawal'](withdrawalTx);

      const updatedTx = service.getTransaction('withdrawal-test-10');
      expect(updatedTx.status).toBe('failed');
      expect(updatedTx.error).toContain('timeout');
    });

    it('should retry when attestation is not ready', async () => {
      const withdrawalTx: BridgeTransaction = {
        id: 'withdrawal-test-11',
        type: 'withdrawal',
        sourceChain: 'stacks',
        destinationChain: 'ethereum',
        amount: '6000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xstacks-retry',
        ethereumAddress: '0xjklmno',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      const attestationService = await import('../services/AttestationService');
      
      // First call throws error (not ready), second call succeeds
      let callCount = 0;
      vi.spyOn(attestationService.attestationService, 'fetchStacksAttestation')
        .mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            throw new Error('Attestation not ready');
          }
          return {
            attestation: '0xstacks-attestation-retry',
            messageHash: '0xstacks-message-retry',
            fetchedAt: Date.now(),
          };
        });

      await service.addTransaction(withdrawalTx);
      
      // First attempt - should not throw, just log debug
      await service['processWithdrawal'](withdrawalTx);
      let updatedTx = service.getTransaction('withdrawal-test-11');
      expect(updatedTx.status).toBe('attesting'); // Still attesting

      // Second attempt - should succeed
      await service['processWithdrawal'](withdrawalTx);
      updatedTx = service.getTransaction('withdrawal-test-11');
      expect(updatedTx.status).toBe('minting');
      expect(updatedTx.attestation).toBe('0xstacks-attestation-retry');
    });

    it('should handle Stacks API errors gracefully', async () => {
      const withdrawalTx: BridgeTransaction = {
        id: 'withdrawal-test-12',
        type: 'withdrawal',
        sourceChain: 'stacks',
        destinationChain: 'ethereum',
        amount: '7000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xstacks-error',
        ethereumAddress: '0xpqrstu',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      const attestationService = await import('../services/AttestationService');
      vi.spyOn(attestationService.attestationService, 'fetchStacksAttestation')
        .mockRejectedValue(new Error('Stacks API error'));

      await service.addTransaction(withdrawalTx);
      await service['processWithdrawal'](withdrawalTx);

      // Should remain in attesting state, not fail immediately
      const updatedTx = service.getTransaction('withdrawal-test-12');
      expect(updatedTx.status).toBe('attesting');
    });
  });

  describe('Withdrawal vs Deposit distinction', () => {
    it('should process withdrawals differently from deposits', async () => {
      // Withdrawal transaction (Stacks→Ethereum)
      const withdrawalTx: BridgeTransaction = {
        id: 'withdrawal-test-13',
        type: 'withdrawal',
        sourceChain: 'stacks',
        destinationChain: 'ethereum',
        amount: '1000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xwithdrawal-tx',
        ethereumAddress: '0xwithdrawal',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      // Deposit transaction (Ethereum→Stacks)
      const depositTx: BridgeTransaction = {
        id: 'deposit-test-13',
        type: 'deposit',
        sourceChain: 'ethereum',
        destinationChain: 'stacks',
        amount: '1000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xdeposit-tx',
        ethereumAddress: '0xdeposit',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      const attestationService = await import('../services/AttestationService');
      
      const fetchStacksSpy = vi.spyOn(attestationService.attestationService, 'fetchStacksAttestation')
        .mockResolvedValue({
          attestation: '0xstacks-attestation',
          messageHash: '0xstacks-message',
          fetchedAt: Date.now(),
        });

      const fetchXReserveSpy = vi.spyOn(attestationService.attestationService, 'fetchXReserveAttestation')
        .mockResolvedValue({
          attestation: 'xreserve-automatic',
          messageHash: '0xdeposit-tx',
          fetchedAt: Date.now(),
        });

      // Process withdrawal
      await service.addTransaction(withdrawalTx);
      await service['processWithdrawal'](withdrawalTx);

      // Process deposit
      await service.addTransaction(depositTx);
      await service['processDeposit'](depositTx);

      // Verify correct methods were called for each type
      expect(fetchStacksSpy).toHaveBeenCalled();
      expect(fetchXReserveSpy).toHaveBeenCalled();

      // Verify withdrawal went to minting, deposit went to complete
      const withdrawalUpdated = service.getTransaction('withdrawal-test-13');
      const depositUpdated = service.getTransaction('deposit-test-13');

      expect(withdrawalUpdated.status).toBe('minting');
      expect(withdrawalUpdated.currentStep).toBe('withdrawal');
      expect(depositUpdated.status).toBe('complete');

      fetchStacksSpy.mockRestore();
      fetchXReserveSpy.mockRestore();
    });

    it('should not classify withdrawals as xReserve deposits', () => {
      const withdrawalTx: BridgeTransaction = {
        id: 'withdrawal-test-14',
        type: 'withdrawal',
        sourceChain: 'stacks',
        destinationChain: 'ethereum',
        amount: '1000000',
        status: 'pending',
        currentStep: 'burn',
        sourceTxHash: '0xwithdrawal-classify',
        ethereumAddress: '0xclassify',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      const result = service.isXReserveDeposit(withdrawalTx);
      expect(result).toBe(false);
    });
  });
});
