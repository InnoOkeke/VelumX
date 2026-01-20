/**
 * Property-based tests for address encoding utilities
 * 
 * Property 2: Address Encoding Correctness
 * For any Stacks address, encoding it to bytes32 format and then decoding it
 * should produce the original address (round-trip property).
 * 
 * Validates: Requirements 1.4, 2.4
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  encodeStacksAddress,
  decodeStacksAddress,
  encodeEthereumAddress,
  decodeEthereumAddress,
  isValidStacksAddress,
  isValidEthereumAddress,
} from '../../../shared/utils/address-encoding';

describe('Property 2: Address Encoding Correctness', () => {
  describe('Stacks Address Round-Trip', () => {
    it('should preserve address through encode/decode cycle', () => {
      fc.assert(
        fc.property(
          // Generate valid Stacks testnet addresses
          stacksAddressArbitrary(),
          (address) => {
            // Encode to bytes32
            const encoded = encodeStacksAddress(address);
            
            // Decode back to address
            const decoded = decodeStacksAddress(encoded);
            
            // Should match original
            expect(decoded).toBe(address);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce valid bytes32 format', () => {
      fc.assert(
        fc.property(
          stacksAddressArbitrary(),
          (address) => {
            const encoded = encodeStacksAddress(address);
            
            // Should be 66 characters (0x + 64 hex chars)
            expect(encoded).toMatch(/^0x[a-fA-F0-9]{64}$/);
            
            // First 11 bytes (22 hex chars after 0x) should be zeros
            const paddingSection = encoded.slice(2, 24);
            expect(paddingSection).toBe('0'.repeat(22));
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Ethereum Address Round-Trip', () => {
    it('should preserve address through encode/decode cycle', () => {
      // Use known valid Ethereum addresses for testing
      const knownAddresses = [
        '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        '0x008888878f94C0d87defdf0B07f46B93C1934442',
        '0x9F685cc614148f35efC238F5DFC977e08ed6bA86',
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      ];

      for (const address of knownAddresses) {
        // Encode to bytes32
        const encoded = encodeEthereumAddress(address);
        console.log('Encoded type:', typeof encoded, 'Value:', encoded);
        
        // Decode back to address
        const decoded = decodeEthereumAddress(encoded);
        console.log('Decoded type:', typeof decoded, 'Value:', decoded);
        
        // Should match original (case-insensitive)
        expect(decoded.toLowerCase()).toBe(address.toLowerCase());
      }
    });

    it('should produce valid bytes32 format', () => {
      const knownAddresses = [
        '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        '0x008888878f94C0d87defdf0B07f46B93C1934442',
      ];

      for (const address of knownAddresses) {
        const encoded = encodeEthereumAddress(address);
        
        // Should be a string (hex format)
        expect(typeof encoded).toBe('string');
        
        // Should be 66 characters (0x + 64 hex chars)
        expect(encoded).toMatch(/^0x[a-fA-F0-9]{64}$/);
        
        // First 12 bytes (24 hex chars after 0x) should be zeros (left-padded)
        const paddingSection = encoded.slice(2, 26);
        expect(paddingSection).toBe('0'.repeat(24));
      }
    });
  });

  describe('Address Validation', () => {
    it('should validate correct Stacks addresses', () => {
      fc.assert(
        fc.property(
          stacksAddressArbitrary(),
          (address) => {
            expect(isValidStacksAddress(address)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject invalid Stacks addresses', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => !s.startsWith('ST') && !s.startsWith('SP')),
          (invalidAddress) => {
            expect(isValidStacksAddress(invalidAddress)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate correct Ethereum addresses', () => {
      const validAddresses = [
        '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        '0x008888878f94C0d87defdf0B07f46B93C1934442',
        '0x9F685cc614148f35efC238F5DFC977e08ed6bA86',
      ];

      for (const address of validAddresses) {
        expect(isValidEthereumAddress(address)).toBe(true);
      }
    });

    it('should reject invalid Ethereum addresses', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => !s.startsWith('0x') || s.length !== 42),
          (invalidAddress) => {
            expect(isValidEthereumAddress(invalidAddress)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle known testnet addresses', () => {
      const knownAddresses = [
        'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        'ST1F1M4YP67NV360FBYR28V7C599AC46F8C4635SH',
        'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG',
      ];

      for (const address of knownAddresses) {
        const encoded = encodeStacksAddress(address);
        const decoded = decodeStacksAddress(encoded);
        expect(decoded).toBe(address);
      }
    });

    it('should handle known Ethereum addresses', () => {
      const knownAddresses = [
        '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        '0x008888878f94C0d87defdf0B07f46B93C1934442',
        '0x9F685cc614148f35efC238F5DFC977e08ed6bA86',
      ];

      for (const address of knownAddresses) {
        const encoded = encodeEthereumAddress(address);
        const decoded = decodeEthereumAddress(encoded);
        expect(decoded.toLowerCase()).toBe(address.toLowerCase());
      }
    });
  });
});

// ============ Custom Arbitraries ============

/**
 * Generates valid Stacks testnet addresses
 * Uses known valid addresses to ensure proper c32check format
 */
function stacksAddressArbitrary(): fc.Arbitrary<string> {
  // Use a pool of known valid testnet addresses
  const validAddresses = [
    'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
    'ST1F1M4YP67NV360FBYR28V7C599AC46F8C4635SH',
    'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG',
    'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5',
    'ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB',
    'ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0',
    'ST3PF13W7Z0RRM42A8VZRVFQ75SV1K26RXEP8YGKJ',
    'ST1HB1T8WRNBYB0Y3T7WXZS38NKKPTBR3EG9EPJKR',
  ];
  
  return fc.constantFrom(...validAddresses);
}

/**
 * Generates valid Ethereum addresses
 * Format: 0x + 40 hex characters
 */
function ethereumAddressArbitrary(): fc.Arbitrary<string> {
  const hexChars = '0123456789abcdef';
  return fc.array(fc.constantFrom(...hexChars.split('')), { minLength: 40, maxLength: 40 })
    .map(chars => '0x' + chars.join(''));
}
