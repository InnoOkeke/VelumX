/**
 * Unit tests for Attestation API endpoints
 * Tests request validation, error responses, and successful responses
 * 
 * Requirements: 8.2, 8.7, 8.8, 8.9
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import attestationRoutes from '../../routes/attestations';
import { attestationService } from '../../services/AttestationService';
import { AttestationData } from '@shared/types';

// Mock the attestation service
vi.mock('../../services/AttestationService', () => ({
  attestationService: {
    fetchCircleAttestation: vi.fn(),
    fetchStacksAttestation: vi.fn(),
    isValidMessageHash: vi.fn(),
    isValidTxHash: vi.fn(),
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

describe('Attestation API Routes', () => {
  let app: Express;

  beforeEach(() => {
    // Create a fresh Express app for each test
    app = express();
    app.use(express.json());
    app.use('/api/attestations', attestationRoutes);
    
    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('GET /api/attestations/circle/:messageHash', () => {
    const mockAttestation: AttestationData = {
      attestation: '0xattestation123',
      messageHash: '0xmessage456',
      fetchedAt: Date.now(),
    };

    it('should return attestation when found', async () => {
      vi.mocked(attestationService.isValidMessageHash).mockReturnValue(true);
      vi.mocked(attestationService.fetchCircleAttestation).mockResolvedValue(mockAttestation);

      const response = await request(app)
        .get('/api/attestations/circle/0xmessage456')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: mockAttestation,
      });
      expect(response.body.timestamp).toBeDefined();
      expect(attestationService.fetchCircleAttestation).toHaveBeenCalledWith(
        '0xmessage456'
      );
    });

    it('should return 400 when messageHash is invalid format', async () => {
      vi.mocked(attestationService.isValidMessageHash).mockReturnValue(false);

      const response = await request(app)
        .get('/api/attestations/circle/invalid-hash')
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Bad Request',
        message: 'Invalid message hash format',
      });
      expect(attestationService.fetchCircleAttestation).not.toHaveBeenCalled();
    });

    it('should return 404 when attestation not found', async () => {
      vi.mocked(attestationService.isValidMessageHash).mockReturnValue(true);
      vi.mocked(attestationService.fetchCircleAttestation).mockRejectedValue(
        new Error('Attestation not found')
      );

      const response = await request(app)
        .get('/api/attestations/circle/0xmessage456')
        .expect(404);

      expect(response.body).toMatchObject({
        error: 'Not Found',
        message: 'Attestation not available yet',
      });
    });

    it('should return 404 on timeout', async () => {
      vi.mocked(attestationService.isValidMessageHash).mockReturnValue(true);
      vi.mocked(attestationService.fetchCircleAttestation).mockRejectedValue(
        new Error('Request timeout')
      );

      const response = await request(app)
        .get('/api/attestations/circle/0xmessage456')
        .expect(404);

      expect(response.body).toMatchObject({
        error: 'Not Found',
        message: 'Attestation not available yet',
      });
    });

    it('should return 500 on service error', async () => {
      vi.mocked(attestationService.isValidMessageHash).mockReturnValue(true);
      vi.mocked(attestationService.fetchCircleAttestation).mockRejectedValue(
        new Error('Internal service error')
      );

      const response = await request(app)
        .get('/api/attestations/circle/0xmessage456')
        .expect(500);

      expect(response.body).toMatchObject({
        error: 'Internal Server Error',
        message: 'Failed to fetch attestation',
      });
    });

    it('should handle special characters in messageHash', async () => {
      vi.mocked(attestationService.isValidMessageHash).mockReturnValue(true);
      vi.mocked(attestationService.fetchCircleAttestation).mockResolvedValue(mockAttestation);

      const messageHash = '0xmessage!@#$%';
      const response = await request(app)
        .get(`/api/attestations/circle/${encodeURIComponent(messageHash)}`)
        .expect(200);

      expect(attestationService.fetchCircleAttestation).toHaveBeenCalledWith(
        messageHash
      );
    });

    it('should validate messageHash before fetching', async () => {
      vi.mocked(attestationService.isValidMessageHash).mockReturnValue(false);

      await request(app)
        .get('/api/attestations/circle/not-a-hash')
        .expect(400);

      expect(attestationService.isValidMessageHash).toHaveBeenCalledWith('not-a-hash');
      expect(attestationService.fetchCircleAttestation).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/attestations/stacks/:txHash', () => {
    const mockAttestation: AttestationData = {
      attestation: '0xstacksattestation789',
      messageHash: '0xstacksmessage012',
      fetchedAt: Date.now(),
    };

    it('should return attestation when found', async () => {
      vi.mocked(attestationService.isValidTxHash).mockReturnValue(true);
      vi.mocked(attestationService.fetchStacksAttestation).mockResolvedValue(mockAttestation);

      const response = await request(app)
        .get('/api/attestations/stacks/0x123abc')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: mockAttestation,
      });
      expect(response.body.timestamp).toBeDefined();
      expect(attestationService.fetchStacksAttestation).toHaveBeenCalledWith(
        '0x123abc'
      );
    });

    it('should return 400 when txHash is invalid format', async () => {
      vi.mocked(attestationService.isValidTxHash).mockReturnValue(false);

      const response = await request(app)
        .get('/api/attestations/stacks/invalid-tx')
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Bad Request',
        message: 'Invalid transaction hash format',
      });
      expect(attestationService.fetchStacksAttestation).not.toHaveBeenCalled();
    });

    it('should return 404 when attestation not found', async () => {
      vi.mocked(attestationService.isValidTxHash).mockReturnValue(true);
      vi.mocked(attestationService.fetchStacksAttestation).mockRejectedValue(
        new Error('Attestation not found')
      );

      const response = await request(app)
        .get('/api/attestations/stacks/0x123abc')
        .expect(404);

      expect(response.body).toMatchObject({
        error: 'Not Found',
        message: 'Attestation not available yet',
      });
    });

    it('should return 404 on timeout', async () => {
      vi.mocked(attestationService.isValidTxHash).mockReturnValue(true);
      vi.mocked(attestationService.fetchStacksAttestation).mockRejectedValue(
        new Error('Request timeout')
      );

      const response = await request(app)
        .get('/api/attestations/stacks/0x123abc')
        .expect(404);

      expect(response.body).toMatchObject({
        error: 'Not Found',
        message: 'Attestation not available yet',
      });
    });

    it('should return 500 on service error', async () => {
      vi.mocked(attestationService.isValidTxHash).mockReturnValue(true);
      vi.mocked(attestationService.fetchStacksAttestation).mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await request(app)
        .get('/api/attestations/stacks/0x123abc')
        .expect(500);

      expect(response.body).toMatchObject({
        error: 'Internal Server Error',
        message: 'Failed to fetch attestation',
      });
    });

    it('should handle very long transaction hashes', async () => {
      vi.mocked(attestationService.isValidTxHash).mockReturnValue(true);
      vi.mocked(attestationService.fetchStacksAttestation).mockResolvedValue(mockAttestation);

      const longTxHash = '0x' + 'a'.repeat(100);
      const response = await request(app)
        .get(`/api/attestations/stacks/${longTxHash}`)
        .expect(200);

      expect(attestationService.fetchStacksAttestation).toHaveBeenCalledWith(
        longTxHash
      );
    });

    it('should validate txHash before fetching', async () => {
      vi.mocked(attestationService.isValidTxHash).mockReturnValue(false);

      await request(app)
        .get('/api/attestations/stacks/not-a-tx-hash')
        .expect(400);

      expect(attestationService.isValidTxHash).toHaveBeenCalledWith('not-a-tx-hash');
      expect(attestationService.fetchStacksAttestation).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should include timestamp in all responses', async () => {
      vi.mocked(attestationService.isValidMessageHash).mockReturnValue(false);

      const response = await request(app)
        .get('/api/attestations/circle/invalid')
        .expect(400);

      expect(response.body.timestamp).toBeDefined();
      expect(typeof response.body.timestamp).toBe('number');
      expect(response.body.timestamp).toBeGreaterThan(Date.now() - 1000);
    });

    it('should log errors appropriately', async () => {
      const { logger } = await import('../../utils/logger');
      
      vi.mocked(attestationService.isValidMessageHash).mockReturnValue(true);
      vi.mocked(attestationService.fetchCircleAttestation).mockRejectedValue(
        new Error('Test error')
      );

      await request(app)
        .get('/api/attestations/circle/0xmessage456')
        .expect(500);

      expect(logger.error).toHaveBeenCalled();
    });

    it('should differentiate between not found and server errors', async () => {
      vi.mocked(attestationService.isValidMessageHash).mockReturnValue(true);

      // Not found error
      vi.mocked(attestationService.fetchCircleAttestation).mockRejectedValue(
        new Error('Attestation not found')
      );
      const notFoundResponse = await request(app)
        .get('/api/attestations/circle/0xmessage456');
      expect(notFoundResponse.status).toBe(404);

      // Server error
      vi.mocked(attestationService.fetchCircleAttestation).mockRejectedValue(
        new Error('Database error')
      );
      const serverErrorResponse = await request(app)
        .get('/api/attestations/circle/0xmessage456');
      expect(serverErrorResponse.status).toBe(500);
    });
  });

  describe('Input Validation', () => {
    it('should reject empty messageHash', async () => {
      vi.mocked(attestationService.isValidMessageHash).mockReturnValue(false);

      const response = await request(app)
        .get('/api/attestations/circle/')
        .expect(404); // Express returns 404 for missing route params
    });

    it('should reject empty txHash', async () => {
      vi.mocked(attestationService.isValidTxHash).mockReturnValue(false);

      const response = await request(app)
        .get('/api/attestations/stacks/')
        .expect(404); // Express returns 404 for missing route params
    });

    it('should handle URL-encoded special characters', async () => {
      vi.mocked(attestationService.isValidMessageHash).mockReturnValue(true);
      vi.mocked(attestationService.fetchCircleAttestation).mockResolvedValue({
        attestation: '0xtest',
        messageHash: '0xtest',
        fetchedAt: Date.now(),
      });

      const specialHash = '0x123+456=789';
      const response = await request(app)
        .get(`/api/attestations/circle/${encodeURIComponent(specialHash)}`)
        .expect(200);

      expect(attestationService.fetchCircleAttestation).toHaveBeenCalledWith(
        specialHash
      );
    });
  });

  describe('Response Format', () => {
    it('should return consistent success response format', async () => {
      vi.mocked(attestationService.isValidMessageHash).mockReturnValue(true);
      vi.mocked(attestationService.fetchCircleAttestation).mockResolvedValue({
        attestation: '0xtest',
        messageHash: '0xtest',
        fetchedAt: 123456,
      });

      const response = await request(app)
        .get('/api/attestations/circle/0xtest')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.data).toHaveProperty('attestation');
      expect(response.body.data).toHaveProperty('messageHash');
      expect(response.body.data).toHaveProperty('fetchedAt');
    });

    it('should return consistent error response format', async () => {
      vi.mocked(attestationService.isValidMessageHash).mockReturnValue(false);

      const response = await request(app)
        .get('/api/attestations/circle/invalid')
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).not.toHaveProperty('success');
    });
  });
});
