/**
 * Attestation API Routes
 * Handles attestation fetching from Circle and Stacks
 */

import { Router, Request, Response } from 'express';
import { attestationService } from '../services/AttestationService';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/attestations/circle/:messageHash
 * Get Circle attestation by message hash
 */
router.get('/circle/:messageHash', async (req: Request, res: Response) => {
  try {
    const messageHash = req.params.messageHash as string;

    if (!messageHash) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Message hash is required',
        timestamp: Date.now(),
      });
    }

    // Validate message hash format
    if (!attestationService.isValidMessageHash(messageHash)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid message hash format',
        timestamp: Date.now(),
      });
    }

    logger.info('Fetching Circle attestation', { messageHash });

    const attestation = await attestationService.fetchCircleAttestation(
      messageHash
      // Uses default maxRetries from config
    );

    res.status(200).json({
      success: true,
      data: attestation,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Error fetching Circle attestation', {
      messageHash: req.params.messageHash,
      error: (error as Error).message,
    });

    // Check if it's a timeout or not found
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('timeout') || errorMessage.includes('not found')) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Attestation not available yet',
        timestamp: Date.now(),
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch attestation',
      timestamp: Date.now(),
    });
  }
});

/**
 * GET /api/attestations/stacks/:txHash
 * Get Stacks attestation by transaction hash
 */
router.get('/stacks/:txHash', async (req: Request, res: Response) => {
  try {
    const txHash = req.params.txHash as string;

    if (!txHash) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Transaction hash is required',
        timestamp: Date.now(),
      });
    }

    // Validate transaction hash format
    if (!attestationService.isValidTxHash(txHash)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid transaction hash format',
        timestamp: Date.now(),
      });
    }

    logger.info('Fetching Stacks attestation', { txHash });

    const attestation = await attestationService.fetchStacksAttestation(
      txHash
      // Uses default maxRetries from config
    );

    res.status(200).json({
      success: true,
      data: attestation,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Error fetching Stacks attestation', {
      txHash: req.params.txHash,
      error: (error as Error).message,
    });

    // Check if it's a timeout or not found
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('timeout') || errorMessage.includes('not found')) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Attestation not available yet',
        timestamp: Date.now(),
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch attestation',
      timestamp: Date.now(),
    });
  }
});

export default router;
