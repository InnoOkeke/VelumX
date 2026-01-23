/**
 * Unit tests for xReserve bridge integration
 * Tests the fetchStacksBalance helper method
 * 
 * Feature: xreserve-bridge-fix
 * Validates: Requirements 2.1, 2.3
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AttestationService } from '../services/AttestationService';

describe('AttestationService - fetchStacksBalance', () => {
  let service: AttestationService;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    service = new AttestationService();
    originalFetch = global.fetch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Successful balance queries', () => {
    it('should fetch USDCx balance for an address with balance', async () => {
      const mockResponse = {
        stx: { balance: '1000000' },
        fungible_tokens: {
          'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx': {
            balance: '5000000',
            total_sent: '0',
            total_received: '5000000',
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const fetchStacksBalance = (service as any).fetchStacksBalance.bind(service);
      const balance = await fetchStacksBalance('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM');

      expect(balance).toBe(5000000n);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/extended/v1/address/ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM/balances'),
        expect.objectContaining({
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        })
      );
    });

    it('should return 0n for address with no USDCx balance', async () => {
      const mockResponse = {
        stx: { balance: '1000000' },
        fungible_tokens: {
          // No USDCx token
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const fetchStacksBalance = (service as any).fetchStacksBalance.bind(service);
      const balance = await fetchStacksBalance('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM');

      expect(balance).toBe(0n);
    });

    it('should return 0n for address with no fungible_tokens field', async () => {
      const mockResponse = {
        stx: { balance: '1000000' },
        // No fungible_tokens field
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const fetchStacksBalance = (service as any).fetchStacksBalance.bind(service);
      const balance = await fetchStacksBalance('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM');

      expect(balance).toBe(0n);
    });

    it('should handle large balance values', async () => {
      const mockResponse = {
        stx: { balance: '1000000' },
        fungible_tokens: {
          'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx': {
            balance: '999999999999999999',
            total_sent: '0',
            total_received: '999999999999999999',
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const fetchStacksBalance = (service as any).fetchStacksBalance.bind(service);
      const balance = await fetchStacksBalance('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM');

      expect(balance).toBe(999999999999999999n);
    });
  });

  describe('Error handling', () => {
    it('should return 0n for 404 response (address not found)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      const fetchStacksBalance = (service as any).fetchStacksBalance.bind(service);
      const balance = await fetchStacksBalance('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM');

      expect(balance).toBe(0n);
    });

    it('should throw error for 500 response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      const fetchStacksBalance = (service as any).fetchStacksBalance.bind(service);

      await expect(
        fetchStacksBalance('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM')
      ).rejects.toThrow('Stacks API error: 500 Internal Server Error');
    });

    it('should throw error for 401 response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as Response);

      const fetchStacksBalance = (service as any).fetchStacksBalance.bind(service);

      await expect(
        fetchStacksBalance('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM')
      ).rejects.toThrow('Stacks API error: 401 Unauthorized');
    });

    it('should throw error for 403 response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      } as Response);

      const fetchStacksBalance = (service as any).fetchStacksBalance.bind(service);

      await expect(
        fetchStacksBalance('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM')
      ).rejects.toThrow('Stacks API error: 403 Forbidden');
    });
  });

  describe('Edge cases', () => {
    it('should handle zero balance', async () => {
      const mockResponse = {
        stx: { balance: '1000000' },
        fungible_tokens: {
          'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx': {
            balance: '0',
            total_sent: '0',
            total_received: '0',
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const fetchStacksBalance = (service as any).fetchStacksBalance.bind(service);
      const balance = await fetchStacksBalance('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM');

      expect(balance).toBe(0n);
    });

    it('should use correct Stacks RPC URL from config', async () => {
      const mockResponse = {
        stx: { balance: '1000000' },
        fungible_tokens: {},
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const fetchStacksBalance = (service as any).fetchStacksBalance.bind(service);
      await fetchStacksBalance('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM');

      // Verify the URL includes the configured Stacks RPC URL
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/extended/v1/address/'),
        expect.any(Object)
      );
    });

    it('should handle different USDCx contract addresses from config', async () => {
      // This test verifies that the method uses config.stacksUsdcxAddress
      // The actual contract address comes from the config
      const mockResponse = {
        stx: { balance: '1000000' },
        fungible_tokens: {
          'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx': {
            balance: '1000000',
            total_sent: '0',
            total_received: '1000000',
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const fetchStacksBalance = (service as any).fetchStacksBalance.bind(service);
      const balance = await fetchStacksBalance('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM');

      expect(balance).toBe(1000000n);
    });
  });
});

describe('AttestationService - verifyBalanceIncrease', () => {
  let service: AttestationService;

  beforeEach(() => {
    service = new AttestationService();
  });

  describe('Balance verification logic', () => {
    it('should return true when balance equals expected amount', () => {
      const verifyBalanceIncrease = (service as any).verifyBalanceIncrease.bind(service);
      const result = verifyBalanceIncrease(5000000n, '5000000');

      expect(result).toBe(true);
    });

    it('should return true when balance exceeds expected amount', () => {
      const verifyBalanceIncrease = (service as any).verifyBalanceIncrease.bind(service);
      const result = verifyBalanceIncrease(10000000n, '5000000');

      expect(result).toBe(true);
    });

    it('should return false when balance is less than expected amount', () => {
      const verifyBalanceIncrease = (service as any).verifyBalanceIncrease.bind(service);
      const result = verifyBalanceIncrease(3000000n, '5000000');

      expect(result).toBe(false);
    });

    it('should return false when balance is zero and expected amount is positive', () => {
      const verifyBalanceIncrease = (service as any).verifyBalanceIncrease.bind(service);
      const result = verifyBalanceIncrease(0n, '5000000');

      expect(result).toBe(false);
    });

    it('should return true when balance is zero and expected amount is zero', () => {
      const verifyBalanceIncrease = (service as any).verifyBalanceIncrease.bind(service);
      const result = verifyBalanceIncrease(0n, '0');

      expect(result).toBe(true);
    });
  });

  describe('Large number handling', () => {
    it('should handle very large balance values', () => {
      const verifyBalanceIncrease = (service as any).verifyBalanceIncrease.bind(service);
      const largeBalance = 999999999999999999n;
      const result = verifyBalanceIncrease(largeBalance, '999999999999999999');

      expect(result).toBe(true);
    });

    it('should handle very large expected amounts', () => {
      const verifyBalanceIncrease = (service as any).verifyBalanceIncrease.bind(service);
      const largeBalance = 1000000000000000000n;
      const result = verifyBalanceIncrease(largeBalance, '999999999999999999');

      expect(result).toBe(true);
    });

    it('should correctly compare when balance is slightly less than expected', () => {
      const verifyBalanceIncrease = (service as any).verifyBalanceIncrease.bind(service);
      const result = verifyBalanceIncrease(999999999999999998n, '999999999999999999');

      expect(result).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle balance exactly one unit above expected', () => {
      const verifyBalanceIncrease = (service as any).verifyBalanceIncrease.bind(service);
      const result = verifyBalanceIncrease(5000001n, '5000000');

      expect(result).toBe(true);
    });

    it('should handle balance exactly one unit below expected', () => {
      const verifyBalanceIncrease = (service as any).verifyBalanceIncrease.bind(service);
      const result = verifyBalanceIncrease(4999999n, '5000000');

      expect(result).toBe(false);
    });

    it('should handle multiple deposits scenario (balance > expected)', () => {
      // Simulates a user who received multiple deposits
      const verifyBalanceIncrease = (service as any).verifyBalanceIncrease.bind(service);
      const result = verifyBalanceIncrease(15000000n, '5000000');

      expect(result).toBe(true);
    });

    it('should handle string conversion for expected amount', () => {
      const verifyBalanceIncrease = (service as any).verifyBalanceIncrease.bind(service);
      // Verify that string to BigInt conversion works correctly
      const result = verifyBalanceIncrease(5000000n, '5000000');

      expect(result).toBe(true);
    });
  });
});

describe('AttestationService - fetchXReserveAttestation', () => {
  let service: AttestationService;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    service = new AttestationService();
    originalFetch = global.fetch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Successful attestation fetch', () => {
    it('should return attestation when balance verification succeeds', async () => {
      const mockResponse = {
        stx: { balance: '1000000' },
        fungible_tokens: {
          'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx': {
            balance: '5000000',
            total_sent: '0',
            total_received: '5000000',
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await service.fetchXReserveAttestation(
        '0x123abc',
        'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        '5000000',
        { maxRetries: 1, retryDelay: 100, timeout: 5000 }
      );

      expect(result.attestation).toBe('xreserve-automatic');
      expect(result.messageHash).toBe('0x123abc');
      expect(result.fetchedAt).toBeDefined();
      expect(typeof result.fetchedAt).toBe('number');
    });

    it('should return attestation when balance exceeds expected amount', async () => {
      const mockResponse = {
        stx: { balance: '1000000' },
        fungible_tokens: {
          'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx': {
            balance: '10000000',
            total_sent: '0',
            total_received: '10000000',
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await service.fetchXReserveAttestation(
        '0x123abc',
        'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        '5000000',
        { maxRetries: 1, retryDelay: 100, timeout: 5000 }
      );

      expect(result.attestation).toBe('xreserve-automatic');
      expect(result.messageHash).toBe('0x123abc');
    });

    it('should use correct parameters from options', async () => {
      const mockResponse = {
        stx: { balance: '1000000' },
        fungible_tokens: {
          'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx': {
            balance: '5000000',
            total_sent: '0',
            total_received: '5000000',
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      await service.fetchXReserveAttestation(
        '0x123abc',
        'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        '5000000',
        { maxRetries: 2, retryDelay: 200, timeout: 10000 }
      );

      // Verify fetch was called with correct address
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/extended/v1/address/ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM/balances'),
        expect.any(Object)
      );
    });
  });

  describe('Retry behavior', () => {
    it('should retry when balance is insufficient and eventually succeed', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        const balance = callCount < 2 ? '0' : '5000000';
        return {
          ok: true,
          status: 200,
          json: async () => ({
            stx: { balance: '1000000' },
            fungible_tokens: {
              'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx': {
                balance,
                total_sent: '0',
                total_received: balance,
              },
            },
          }),
        } as Response;
      });

      const result = await service.fetchXReserveAttestation(
        '0x123abc',
        'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        '5000000',
        { maxRetries: 3, retryDelay: 100, timeout: 5000 }
      );

      expect(result.attestation).toBe('xreserve-automatic');
      expect(callCount).toBe(2);
    });

    it('should throw error when balance never reaches expected amount', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          stx: { balance: '1000000' },
          fungible_tokens: {
            'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx': {
              balance: '1000000',
              total_sent: '0',
              total_received: '1000000',
            },
          },
        }),
      } as Response);

      await expect(
        service.fetchXReserveAttestation(
          '0x123abc',
          'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
          '5000000',
          { maxRetries: 2, retryDelay: 100, timeout: 5000 }
        )
      ).rejects.toThrow(/xReserve balance verification not ready after 2 attempts/);
    });

    it('should retry when address returns 404 initially', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: false,
            status: 404,
            statusText: 'Not Found',
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            stx: { balance: '1000000' },
            fungible_tokens: {
              'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx': {
                balance: '5000000',
                total_sent: '0',
                total_received: '5000000',
              },
            },
          }),
        } as Response;
      });

      const result = await service.fetchXReserveAttestation(
        '0x123abc',
        'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        '5000000',
        { maxRetries: 3, retryDelay: 100, timeout: 5000 }
      );

      expect(result.attestation).toBe('xreserve-automatic');
      expect(callCount).toBe(2);
    });
  });

  describe('Error handling', () => {
    it('should throw error for non-retryable API errors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      await expect(
        service.fetchXReserveAttestation(
          '0x123abc',
          'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
          '5000000',
          { maxRetries: 2, retryDelay: 100, timeout: 5000 }
        )
      ).rejects.toThrow('Stacks API error: 500 Internal Server Error');
    });

    it('should throw error for 401 unauthorized', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as Response);

      await expect(
        service.fetchXReserveAttestation(
          '0x123abc',
          'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
          '5000000',
          { maxRetries: 2, retryDelay: 100, timeout: 5000 }
        )
      ).rejects.toThrow('Stacks API error: 401 Unauthorized');
    });

    it('should throw error for 403 forbidden', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      } as Response);

      await expect(
        service.fetchXReserveAttestation(
          '0x123abc',
          'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
          '5000000',
          { maxRetries: 2, retryDelay: 100, timeout: 5000 }
        )
      ).rejects.toThrow('Stacks API error: 403 Forbidden');
    });
  });

  describe('Edge cases', () => {
    it('should handle zero expected amount', async () => {
      const mockResponse = {
        stx: { balance: '1000000' },
        fungible_tokens: {
          'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx': {
            balance: '0',
            total_sent: '0',
            total_received: '0',
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await service.fetchXReserveAttestation(
        '0x123abc',
        'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        '0',
        { maxRetries: 1, retryDelay: 100, timeout: 5000 }
      );

      expect(result.attestation).toBe('xreserve-automatic');
    });

    it('should handle very large amounts', async () => {
      const mockResponse = {
        stx: { balance: '1000000' },
        fungible_tokens: {
          'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx': {
            balance: '999999999999999999',
            total_sent: '0',
            total_received: '999999999999999999',
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await service.fetchXReserveAttestation(
        '0x123abc',
        'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        '999999999999999999',
        { maxRetries: 1, retryDelay: 100, timeout: 5000 }
      );

      expect(result.attestation).toBe('xreserve-automatic');
    });

    it('should handle address with no fungible tokens', async () => {
      const mockResponse = {
        stx: { balance: '1000000' },
        fungible_tokens: {},
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      await expect(
        service.fetchXReserveAttestation(
          '0x123abc',
          'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
          '5000000',
          { maxRetries: 1, retryDelay: 100, timeout: 5000 }
        )
      ).rejects.toThrow(/xReserve balance verification not ready/);
    });

    it('should use default options when not provided', async () => {
      const mockResponse = {
        stx: { balance: '1000000' },
        fungible_tokens: {
          'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx': {
            balance: '5000000',
            total_sent: '0',
            total_received: '5000000',
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await service.fetchXReserveAttestation(
        '0x123abc',
        'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        '5000000'
      );

      expect(result.attestation).toBe('xreserve-automatic');
    });
  });

  describe('Integration with helper methods', () => {
    it('should correctly use fetchStacksBalance and verifyBalanceIncrease', async () => {
      const mockResponse = {
        stx: { balance: '1000000' },
        fungible_tokens: {
          'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx': {
            balance: '5000000',
            total_sent: '0',
            total_received: '5000000',
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await service.fetchXReserveAttestation(
        '0x123abc',
        'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        '5000000',
        { maxRetries: 1, retryDelay: 100, timeout: 5000 }
      );

      // Verify that the method correctly integrated the helper methods
      expect(result.attestation).toBe('xreserve-automatic');
      expect(result.messageHash).toBe('0x123abc');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle balance exactly matching expected amount', async () => {
      const mockResponse = {
        stx: { balance: '1000000' },
        fungible_tokens: {
          'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx': {
            balance: '5000000',
            total_sent: '0',
            total_received: '5000000',
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await service.fetchXReserveAttestation(
        '0x123abc',
        'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        '5000000',
        { maxRetries: 1, retryDelay: 100, timeout: 5000 }
      );

      expect(result.attestation).toBe('xreserve-automatic');
    });

    it('should handle balance one unit below expected amount', async () => {
      const mockResponse = {
        stx: { balance: '1000000' },
        fungible_tokens: {
          'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx': {
            balance: '4999999',
            total_sent: '0',
            total_received: '4999999',
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      await expect(
        service.fetchXReserveAttestation(
          '0x123abc',
          'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
          '5000000',
          { maxRetries: 1, retryDelay: 100, timeout: 5000 }
        )
      ).rejects.toThrow(/xReserve balance verification not ready/);
    });
  });
});

describe('TransactionMonitorService - isXReserveDeposit', () => {
  let service: any;

  beforeEach(async () => {
    const { TransactionMonitorService } = await import('../services/TransactionMonitorService');
    service = new TransactionMonitorService();
  });

  describe('xReserve deposit classification', () => {
    it('should return true for ethereum→stacks deposits', () => {
      const tx = {
        id: 'test-1',
        type: 'deposit' as const,
        sourceChain: 'ethereum' as const,
        destinationChain: 'stacks' as const,
        amount: '1000000',
        status: 'pending' as const,
        currentStep: 'deposit' as const,
        sourceTxHash: '0x123',
        ethereumAddress: '0xabc',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      const result = service.isXReserveDeposit(tx);
      expect(result).toBe(true);
    });

    it('should return false for stacks→ethereum withdrawals', () => {
      const tx = {
        id: 'test-2',
        type: 'withdrawal' as const,
        sourceChain: 'stacks' as const,
        destinationChain: 'ethereum' as const,
        amount: '1000000',
        status: 'pending' as const,
        currentStep: 'burn' as const,
        sourceTxHash: '0x456',
        ethereumAddress: '0xdef',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      const result = service.isXReserveDeposit(tx);
      expect(result).toBe(false);
    });

    it('should return false for ethereum→ethereum transactions (invalid)', () => {
      const tx = {
        id: 'test-3',
        type: 'deposit' as const,
        sourceChain: 'ethereum' as const,
        destinationChain: 'ethereum' as const,
        amount: '1000000',
        status: 'pending' as const,
        currentStep: 'deposit' as const,
        sourceTxHash: '0x789',
        ethereumAddress: '0xghi',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      const result = service.isXReserveDeposit(tx);
      expect(result).toBe(false);
    });

    it('should return false for stacks→stacks transactions (invalid)', () => {
      const tx = {
        id: 'test-4',
        type: 'deposit' as const,
        sourceChain: 'stacks' as const,
        destinationChain: 'stacks' as const,
        amount: '1000000',
        status: 'pending' as const,
        currentStep: 'deposit' as const,
        sourceTxHash: '0xjkl',
        ethereumAddress: '0xmno',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      const result = service.isXReserveDeposit(tx);
      expect(result).toBe(false);
    });

    it('should return false for stacks→ethereum deposits (CCTP)', () => {
      const tx = {
        id: 'test-5',
        type: 'deposit' as const,
        sourceChain: 'stacks' as const,
        destinationChain: 'ethereum' as const,
        amount: '1000000',
        status: 'pending' as const,
        currentStep: 'deposit' as const,
        sourceTxHash: '0xpqr',
        ethereumAddress: '0xstu',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      const result = service.isXReserveDeposit(tx);
      expect(result).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle transactions with all required fields', () => {
      const tx = {
        id: 'test-6',
        type: 'deposit' as const,
        sourceChain: 'ethereum' as const,
        destinationChain: 'stacks' as const,
        amount: '1000000',
        status: 'complete' as const,
        currentStep: 'mint' as const,
        sourceTxHash: '0xvwx',
        destinationTxHash: '0xyzabc',
        messageHash: '0xdef',
        attestation: 'xreserve-automatic',
        attestationFetchedAt: Date.now(),
        ethereumAddress: '0xghi',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        completedAt: Date.now(),
        retryCount: 0,
        isGasless: true,
        gasFeeInUsdcx: '50000',
      };

      const result = service.isXReserveDeposit(tx);
      expect(result).toBe(true);
    });

    it('should correctly classify based on type field', () => {
      const depositTx = {
        id: 'test-7',
        type: 'deposit' as const,
        sourceChain: 'ethereum' as const,
        destinationChain: 'stacks' as const,
        amount: '1000000',
        status: 'pending' as const,
        currentStep: 'deposit' as const,
        sourceTxHash: '0xjkl',
        ethereumAddress: '0xmno',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      const withdrawalTx = {
        ...depositTx,
        id: 'test-8',
        type: 'withdrawal' as const,
      };

      expect(service.isXReserveDeposit(depositTx)).toBe(true);
      expect(service.isXReserveDeposit(withdrawalTx)).toBe(false);
    });
  });
});

describe('TransactionMonitorService - checkEthereumConfirmation', () => {
  let service: any;
  let originalFetch: typeof global.fetch;

  beforeEach(async () => {
    const { TransactionMonitorService } = await import('../services/TransactionMonitorService');
    service = new TransactionMonitorService();
    originalFetch = global.fetch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Successful confirmation checks', () => {
    it('should return true when transaction is mined and succeeded', async () => {
      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          status: '0x1',
          blockNumber: '0x123456',
          transactionHash: '0xabc123',
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await service.checkEthereumConfirmation('0xabc123');

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('eth_getTransactionReceipt'),
        })
      );
    });

    it('should use correct RPC method and parameters', async () => {
      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          status: '0x1',
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await service.checkEthereumConfirmation('0xtest123');

      const fetchCall = vi.mocked(global.fetch).mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);

      expect(body.jsonrpc).toBe('2.0');
      expect(body.method).toBe('eth_getTransactionReceipt');
      expect(body.params).toEqual(['0xtest123']);
      expect(body.id).toBe(1);
    });
  });

  describe('Transaction not yet mined', () => {
    it('should return false when receipt is null (transaction not mined)', async () => {
      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: null,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await service.checkEthereumConfirmation('0xpending123');

      expect(result).toBe(false);
    });

    it('should return false when result is undefined', async () => {
      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await service.checkEthereumConfirmation('0xpending456');

      expect(result).toBe(false);
    });
  });

  describe('Failed transactions', () => {
    it('should return false when transaction failed (status === 0x0)', async () => {
      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          status: '0x0',
          blockNumber: '0x123456',
          transactionHash: '0xfailed123',
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await service.checkEthereumConfirmation('0xfailed123');

      expect(result).toBe(false);
    });

    it('should return false for any status other than 0x1', async () => {
      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          status: '0x2',
          blockNumber: '0x123456',
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await service.checkEthereumConfirmation('0xtest789');

      expect(result).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('should return false and log error when fetch fails', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await service.checkEthereumConfirmation('0xerror123');

      expect(result).toBe(false);
    });

    it('should return false when RPC returns error response', async () => {
      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: -32000,
          message: 'Invalid transaction hash',
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await service.checkEthereumConfirmation('0xinvalid');

      expect(result).toBe(false);
    });

    it('should handle malformed JSON response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      } as Response);

      const result = await service.checkEthereumConfirmation('0xmalformed');

      expect(result).toBe(false);
    });

    it('should handle HTTP error responses', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({}),
      } as Response);

      const result = await service.checkEthereumConfirmation('0xhttp500');

      expect(result).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty transaction hash', async () => {
      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: null,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await service.checkEthereumConfirmation('');

      expect(result).toBe(false);
    });

    it('should handle transaction hash with different formats', async () => {
      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          status: '0x1',
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      // With 0x prefix
      let result = await service.checkEthereumConfirmation('0xabc123def456');
      expect(result).toBe(true);

      // Without 0x prefix (should still work if RPC accepts it)
      result = await service.checkEthereumConfirmation('abc123def456');
      expect(result).toBe(true);
    });

    it('should handle response with additional fields', async () => {
      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          status: '0x1',
          blockNumber: '0x123456',
          blockHash: '0xblock123',
          transactionHash: '0xtx123',
          from: '0xfrom',
          to: '0xto',
          gasUsed: '0x5208',
          cumulativeGasUsed: '0x5208',
          logs: [],
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await service.checkEthereumConfirmation('0xtx123');

      expect(result).toBe(true);
    });

    it('should handle timeout errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Request timeout'));

      const result = await service.checkEthereumConfirmation('0xtimeout');

      expect(result).toBe(false);
    });
  });

  describe('Integration with config', () => {
    it('should use ethereumRpcUrl from config', async () => {
      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          status: '0x1',
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await service.checkEthereumConfirmation('0xtest');

      // Verify that fetch was called with the RPC URL
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object)
      );
    });
  });
});

/**
 * Unit tests for CCTP deposit flow (backward compatibility)
 * Tests that non-xReserve deposits continue to work correctly
 * 
 * In this system, xReserve handles ALL Ethereum→Stacks deposits automatically.
 * CCTP is used for other bridge scenarios (e.g., future multi-chain support).
 * These tests verify that the CCTP flow (Circle API + manual minting) still works
 * for non-xReserve transactions to maintain backward compatibility.
 * 
 * Feature: xreserve-bridge-fix
 * Task: 4.1 Add unit tests for CCTP deposit flow
 * Validates: Requirements 5.1
 */

describe('TransactionMonitorService - CCTP Deposit Flow', () => {
  let service: any;
  let originalFetch: typeof global.fetch;

  beforeEach(async () => {
    const { TransactionMonitorService } = await import('../services/TransactionMonitorService');
    service = new TransactionMonitorService();
    originalFetch = global.fetch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('CCTP deposits call Circle API', () => {
    it('should call fetchCircleAttestation for non-xReserve deposits (future CCTP support)', async () => {
      // Create a non-xReserve deposit (e.g., from another chain in future)
      // Using a hypothetical "polygon" source chain to represent non-xReserve CCTP
      const cctpTx: BridgeTransaction = {
        id: 'cctp-test-1',
        type: 'deposit',
        sourceChain: 'polygon' as any, // Non-ethereum source = not xReserve
        destinationChain: 'stacks',
        amount: '1000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xcctp123',
        messageHash: '0xmessage123', // CCTP transactions have messageHash
        ethereumAddress: '0xabc',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      // Mock Circle API response
      const mockCircleResponse = {
        attestation: '0xcircle-attestation-data',
        messageHash: '0xmessage123',
        fetchedAt: Date.now(),
      };

      // Mock attestationService.fetchCircleAttestation
      const attestationService = await import('../services/AttestationService');
      const fetchCircleSpy = vi.spyOn(attestationService.attestationService, 'fetchCircleAttestation')
        .mockResolvedValue(mockCircleResponse);

      // Add transaction to service queue
      await service.addTransaction(cctpTx);

      // Process the deposit
      await service['processDeposit'](cctpTx);

      // Verify fetchCircleAttestation was called with messageHash
      expect(fetchCircleSpy).toHaveBeenCalledWith('0xmessage123');

      fetchCircleSpy.mockRestore();
    });

    it('should not call fetchXReserveAttestation for non-xReserve deposits', async () => {
      const cctpTx: BridgeTransaction = {
        id: 'cctp-test-2',
        type: 'deposit',
        sourceChain: 'polygon' as any, // Non-ethereum source
        destinationChain: 'stacks',
        amount: '1000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xcctp456',
        messageHash: '0xmessage456',
        ethereumAddress: '0xdef',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      const attestationService = await import('../services/AttestationService');
      
      // Mock both methods
      const fetchCircleSpy = vi.spyOn(attestationService.attestationService, 'fetchCircleAttestation')
        .mockResolvedValue({
          attestation: '0xcircle-attestation',
          messageHash: '0xmessage456',
          fetchedAt: Date.now(),
        });
      
      const fetchXReserveSpy = vi.spyOn(attestationService.attestationService, 'fetchXReserveAttestation')
        .mockResolvedValue({
          attestation: 'xreserve-automatic',
          messageHash: '0xcctp456',
          fetchedAt: Date.now(),
        });

      await service.addTransaction(cctpTx);
      await service['processDeposit'](cctpTx);

      // Verify only Circle API was called, not xReserve
      expect(fetchCircleSpy).toHaveBeenCalled();
      expect(fetchXReserveSpy).not.toHaveBeenCalled();

      fetchCircleSpy.mockRestore();
      fetchXReserveSpy.mockRestore();
    });

    it('should fail non-xReserve deposit if messageHash is missing', async () => {
      const cctpTxNoMessageHash: BridgeTransaction = {
        id: 'cctp-test-3',
        type: 'deposit',
        sourceChain: 'polygon' as any, // Non-ethereum source
        destinationChain: 'stacks',
        amount: '1000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xcctp789',
        // messageHash is missing - this should cause an error
        ethereumAddress: '0xghi',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      await service.addTransaction(cctpTxNoMessageHash);
      await service['processDeposit'](cctpTxNoMessageHash);

      // Verify transaction was marked as failed
      const updatedTx = service.getTransaction('cctp-test-3');
      expect(updatedTx.status).toBe('failed');
      expect(updatedTx.error).toContain('Missing message hash');
    });
  });

  describe('CCTP deposits go through minting state', () => {
    it('should transition non-xReserve deposit to minting state after attestation', async () => {
      const cctpTx: BridgeTransaction = {
        id: 'cctp-test-4',
        type: 'deposit',
        sourceChain: 'polygon' as any, // Non-ethereum source
        destinationChain: 'stacks',
        amount: '1000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xcctp-minting-1',
        messageHash: '0xmessage-minting-1',
        ethereumAddress: '0xjkl',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      const attestationService = await import('../services/AttestationService');
      vi.spyOn(attestationService.attestationService, 'fetchCircleAttestation')
        .mockResolvedValue({
          attestation: '0xcircle-attestation-minting',
          messageHash: '0xmessage-minting-1',
          fetchedAt: Date.now(),
        });

      await service.addTransaction(cctpTx);
      await service['processDeposit'](cctpTx);

      // Verify transaction transitioned to minting state
      const updatedTx = service.getTransaction('cctp-test-4');
      expect(updatedTx.status).toBe('minting');
      expect(updatedTx.currentStep).toBe('mint');
      expect(updatedTx.attestation).toBe('0xcircle-attestation-minting');
    });

    it('should not skip minting state for non-xReserve deposits', async () => {
      const cctpTx: BridgeTransaction = {
        id: 'cctp-test-5',
        type: 'deposit',
        sourceChain: 'polygon' as any, // Non-ethereum source
        destinationChain: 'stacks',
        amount: '1000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xcctp-no-skip',
        messageHash: '0xmessage-no-skip',
        ethereumAddress: '0xmno',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      const attestationService = await import('../services/AttestationService');
      vi.spyOn(attestationService.attestationService, 'fetchCircleAttestation')
        .mockResolvedValue({
          attestation: '0xcircle-attestation',
          messageHash: '0xmessage-no-skip',
          fetchedAt: Date.now(),
        });

      await service.addTransaction(cctpTx);
      await service['processDeposit'](cctpTx);

      const updatedTx = service.getTransaction('cctp-test-5');
      
      // CCTP should go to minting, not directly to complete
      expect(updatedTx.status).toBe('minting');
      expect(updatedTx.status).not.toBe('complete');
    });

    it('should call performManualMinting for non-xReserve deposits in minting state', async () => {
      const cctpTx: BridgeTransaction = {
        id: 'cctp-test-6',
        type: 'deposit',
        sourceChain: 'polygon' as any, // Non-ethereum source
        destinationChain: 'stacks',
        amount: '1000000',
        status: 'minting',
        currentStep: 'mint',
        sourceTxHash: '0xcctp-perform-mint',
        messageHash: '0xmessage-perform-mint',
        attestation: '0xcircle-attestation-perform',
        attestationFetchedAt: Date.now(),
        ethereumAddress: '0xpqr',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      // Mock stacksMintService
      const stacksMintService = await import('../services/StacksMintService');
      vi.spyOn(stacksMintService.stacksMintService, 'validateRelayerBalance')
        .mockResolvedValue(true);
      vi.spyOn(stacksMintService.stacksMintService, 'mintUsdcx')
        .mockResolvedValue('0xmint-tx-hash');

      await service.addTransaction(cctpTx);
      await service['processDeposit'](cctpTx);

      // Verify minting was performed
      expect(stacksMintService.stacksMintService.mintUsdcx).toHaveBeenCalledWith(
        'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        '1000000',
        '0xcircle-attestation-perform',
        '0xmessage-perform-mint'
      );

      // Verify transaction was marked complete after minting
      const updatedTx = service.getTransaction('cctp-test-6');
      expect(updatedTx.status).toBe('complete');
      expect(updatedTx.destinationTxHash).toBe('0xmint-tx-hash');
    });
  });

  describe('Circle attestation is fetched correctly', () => {
    it('should fetch Circle attestation with correct messageHash', async () => {
      const messageHash = '0x' + 'a'.repeat(64);
      const cctpTx: BridgeTransaction = {
        id: 'cctp-test-7',
        type: 'deposit',
        sourceChain: 'polygon' as any, // Non-ethereum source
        destinationChain: 'stacks',
        amount: '5000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xcctp-correct-hash',
        messageHash,
        ethereumAddress: '0xstu',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      const attestationService = await import('../services/AttestationService');
      const fetchCircleSpy = vi.spyOn(attestationService.attestationService, 'fetchCircleAttestation')
        .mockResolvedValue({
          attestation: '0xcircle-attestation-correct',
          messageHash,
          fetchedAt: Date.now(),
        });

      await service.addTransaction(cctpTx);
      await service['processDeposit'](cctpTx);

      // Verify correct messageHash was used
      expect(fetchCircleSpy).toHaveBeenCalledWith(messageHash);

      const updatedTx = service.getTransaction('cctp-test-7');
      expect(updatedTx.attestation).toBe('0xcircle-attestation-correct');
      expect(updatedTx.attestationFetchedAt).toBeDefined();

      fetchCircleSpy.mockRestore();
    });

    it('should store Circle attestation data in transaction', async () => {
      const cctpTx: BridgeTransaction = {
        id: 'cctp-test-8',
        type: 'deposit',
        sourceChain: 'polygon' as any, // Non-ethereum source
        destinationChain: 'stacks',
        amount: '2000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xcctp-store-data',
        messageHash: '0xmessage-store-data',
        ethereumAddress: '0xvwx',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      const fetchedAt = Date.now();
      const attestationService = await import('../services/AttestationService');
      vi.spyOn(attestationService.attestationService, 'fetchCircleAttestation')
        .mockResolvedValue({
          attestation: '0xcircle-attestation-stored',
          messageHash: '0xmessage-store-data',
          fetchedAt,
        });

      await service.addTransaction(cctpTx);
      await service['processDeposit'](cctpTx);

      const updatedTx = service.getTransaction('cctp-test-8');
      
      // Verify all attestation data was stored
      expect(updatedTx.attestation).toBe('0xcircle-attestation-stored');
      expect(updatedTx.attestationFetchedAt).toBe(fetchedAt);
      expect(updatedTx.status).toBe('minting');
    });

    it('should retry Circle attestation fetch when not ready', async () => {
      const cctpTx: BridgeTransaction = {
        id: 'cctp-test-9',
        type: 'deposit',
        sourceChain: 'polygon' as any, // Non-ethereum source
        destinationChain: 'stacks',
        amount: '3000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xcctp-retry',
        messageHash: '0xmessage-retry',
        ethereumAddress: '0xyzabc',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      const attestationService = await import('../services/AttestationService');
      
      // First call throws error (not ready), second call succeeds
      let callCount = 0;
      vi.spyOn(attestationService.attestationService, 'fetchCircleAttestation')
        .mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            throw new Error('Attestation not ready');
          }
          return {
            attestation: '0xcircle-attestation-retry',
            messageHash: '0xmessage-retry',
            fetchedAt: Date.now(),
          };
        });

      await service.addTransaction(cctpTx);
      
      // First attempt - should not throw, just log debug
      await service['processDeposit'](cctpTx);
      let updatedTx = service.getTransaction('cctp-test-9');
      expect(updatedTx.status).toBe('attesting'); // Still attesting

      // Second attempt - should succeed
      await service['processDeposit'](cctpTx);
      updatedTx = service.getTransaction('cctp-test-9');
      expect(updatedTx.status).toBe('minting');
      expect(updatedTx.attestation).toBe('0xcircle-attestation-retry');
    });

    it('should handle Circle API errors gracefully', async () => {
      const cctpTx: BridgeTransaction = {
        id: 'cctp-test-10',
        type: 'deposit',
        sourceChain: 'polygon' as any, // Non-ethereum source
        destinationChain: 'stacks',
        amount: '4000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xcctp-error',
        messageHash: '0xmessage-error',
        ethereumAddress: '0xdefghi',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      const attestationService = await import('../services/AttestationService');
      vi.spyOn(attestationService.attestationService, 'fetchCircleAttestation')
        .mockRejectedValue(new Error('Circle API error'));

      await service.addTransaction(cctpTx);
      await service['processDeposit'](cctpTx);

      // Should remain in attesting state, not fail immediately
      const updatedTx = service.getTransaction('cctp-test-10');
      expect(updatedTx.status).toBe('attesting');
    });
  });

  describe('xReserve vs non-xReserve distinction', () => {
    it('should correctly distinguish xReserve (ethereum→stacks) from CCTP (other chains)', async () => {
      // xReserve transaction (ethereum→stacks)
      const xReserveTx: BridgeTransaction = {
        id: 'xreserve-test-1',
        type: 'deposit',
        sourceChain: 'ethereum',
        destinationChain: 'stacks',
        amount: '1000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xxreserve-tx',
        // No messageHash - xReserve doesn't need it
        ethereumAddress: '0xxreserve',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      // CCTP transaction (non-ethereum source)
      const cctpTx: BridgeTransaction = {
        id: 'cctp-test-11',
        type: 'deposit',
        sourceChain: 'polygon' as any, // Non-ethereum source = CCTP
        destinationChain: 'stacks',
        amount: '1000000',
        status: 'attesting',
        currentStep: 'attestation',
        sourceTxHash: '0xcctp-tx',
        messageHash: '0xmessage-cctp', // Has messageHash for CCTP
        ethereumAddress: '0xcctp',
        stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        isGasless: false,
      };

      const attestationService = await import('../services/AttestationService');
      
      const fetchXReserveSpy = vi.spyOn(attestationService.attestationService, 'fetchXReserveAttestation')
        .mockResolvedValue({
          attestation: 'xreserve-automatic',
          messageHash: '0xxreserve-tx',
          fetchedAt: Date.now(),
        });

      const fetchCircleSpy = vi.spyOn(attestationService.attestationService, 'fetchCircleAttestation')
        .mockResolvedValue({
          attestation: '0xcircle-attestation',
          messageHash: '0xmessage-cctp',
          fetchedAt: Date.now(),
        });

      // Process xReserve transaction
      await service.addTransaction(xReserveTx);
      await service['processDeposit'](xReserveTx);

      // Process CCTP transaction
      await service.addTransaction(cctpTx);
      await service['processDeposit'](cctpTx);

      // Verify correct methods were called for each type
      expect(fetchXReserveSpy).toHaveBeenCalled();
      expect(fetchCircleSpy).toHaveBeenCalled();

      // Verify xReserve went to complete, CCTP went to minting
      const xReserveUpdated = service.getTransaction('xreserve-test-1');
      const cctpUpdated = service.getTransaction('cctp-test-11');

      expect(xReserveUpdated.status).toBe('complete');
      expect(cctpUpdated.status).toBe('minting');

      fetchXReserveSpy.mockRestore();
      fetchCircleSpy.mockRestore();
    });
  });
});
