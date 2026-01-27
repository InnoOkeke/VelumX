/**
 * Paymaster API Routes
 * Handles gasless transaction fee estimation and sponsorship
 */

import { Router, Request, Response } from 'express';
import { paymasterService } from '../services/PaymasterService';
import { logger } from '../utils/logger';
import { createStrictRateLimiter } from '../middleware/rate-limit';

const router = Router();

// Apply strict rate limiting to paymaster endpoints
const strictLimiter = createStrictRateLimiter();

/**
 * POST /api/paymaster/estimate
 * Estimate gasless transaction fee
 */
router.post('/estimate', async (req: Request, res: Response) => {
  try {
    const { estimatedGasInStx } = req.body;

    if (!estimatedGasInStx) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'estimatedGasInStx is required',
        timestamp: Date.now(),
      });
    }

    // Convert to bigint
    const gasInStx = BigInt(estimatedGasInStx);

    if (gasInStx <= 0n) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'estimatedGasInStx must be greater than 0',
        timestamp: Date.now(),
      });
    }

    logger.info('Estimating gasless fee', {
      estimatedGasInStx: gasInStx.toString(),
    });

    const feeEstimate = await paymasterService.estimateFee(gasInStx);

    // Convert bigints to strings for JSON serialization
    const response = {
      gasInStx: feeEstimate.gasInStx.toString(),
      gasInUsdcx: feeEstimate.gasInUsdcx.toString(),
      stxToUsd: feeEstimate.stxToUsd,
      usdcToUsd: feeEstimate.usdcToUsd,
      markup: feeEstimate.markup,
      estimatedAt: feeEstimate.estimatedAt,
      validUntil: feeEstimate.validUntil,
    };

    res.status(200).json({
      success: true,
      data: response,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Error estimating gasless fee', {
      error: (error as Error).message,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to estimate fee',
      timestamp: Date.now(),
    });
  }
});

/**
 * POST /api/paymaster/sponsor
 * Submit sponsored transaction
 */
router.post('/sponsor', strictLimiter, async (req: Request, res: Response) => {
  try {
    const { transaction, userAddress, estimatedFee } = req.body;

    // Validate required fields
    if (!transaction || !userAddress || !estimatedFee) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'transaction, userAddress, and estimatedFee are required',
        timestamp: Date.now(),
      });
    }

    logger.info('Sponsoring transaction', {
      userAddress,
      estimatedFee,
    });

    // Convert estimatedFee to bigint
    const feeInUsdcx = BigInt(estimatedFee);

    // Validate user has sufficient balance
    const hasSufficientBalance = await paymasterService.validateUserBalance(
      userAddress,
      feeInUsdcx
    );

    if (!hasSufficientBalance) {
      return res.status(400).json({
        error: 'Insufficient Balance',
        message: 'User does not have sufficient USDCx balance to pay fee',
        timestamp: Date.now(),
      });
    }

    // Sponsor the transaction
    const txid = await paymasterService.sponsorTransaction(
      transaction,
      userAddress,
      feeInUsdcx
    );

    res.status(200).json({
      success: true,
      data: { txid },
      message: 'Transaction sponsored successfully',
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Error sponsoring transaction', {
      error: (error as Error).message,
    });

    // Check for specific error types
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('balance too low')) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Paymaster service temporarily unavailable',
        timestamp: Date.now(),
      });
    }

    if (errorMessage.includes('Relayer mempool congested')) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: errorMessage, // Keeps the "Please wait X server" part
        timestamp: Date.now(),
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: errorMessage || 'Failed to sponsor transaction',
      timestamp: Date.now(),
    });
  }
});

/**
 * GET /api/paymaster/rates
 * Get current exchange rates
 */
router.get('/rates', async (req: Request, res: Response) => {
  try {
    logger.debug('Fetching exchange rates');

    const rates = await paymasterService.getExchangeRates();

    res.status(200).json({
      success: true,
      data: rates,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error('Error fetching exchange rates', {
      error: (error as Error).message,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch exchange rates',
      timestamp: Date.now(),
    });
  }
});

export default router;
