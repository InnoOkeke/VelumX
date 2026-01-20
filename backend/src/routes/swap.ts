/**
 * Swap API Routes
 * Endpoints for token swapping via ALEX DEX
 */

import { Router, Request, Response } from 'express';
import { swapService } from '../services/SwapService';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/swap/tokens
 * Get list of supported tokens for swapping
 */
router.get('/tokens', async (req: Request, res: Response) => {
  try {
    logger.info('Fetching supported tokens');

    const tokens = await swapService.getSupportedTokens();

    res.json({
      success: true,
      data: tokens,
    });
  } catch (error) {
    logger.error('Failed to fetch tokens', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch supported tokens',
    });
  }
});

/**
 * POST /api/swap/quote
 * Get swap quote for token pair
 * 
 * Body: {
 *   inputToken: string,
 *   outputToken: string,
 *   inputAmount: string
 * }
 */
router.post('/quote', async (req: Request, res: Response) => {
  try {
    const { inputToken, outputToken, inputAmount } = req.body;

    // Validation
    if (!inputToken || !outputToken || !inputAmount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: inputToken, outputToken, inputAmount',
      });
    }

    const amount = BigInt(inputAmount);

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Input amount must be greater than 0',
      });
    }

    logger.info('Getting swap quote', { inputToken, outputToken, inputAmount });

    const quote = await swapService.getSwapQuote(inputToken, outputToken, amount);

    res.json({
      success: true,
      data: {
        ...quote,
        inputAmount: quote.inputAmount.toString(),
        outputAmount: quote.outputAmount.toString(),
        estimatedFee: quote.estimatedFee.toString(),
      },
    });
  } catch (error) {
    logger.error('Failed to get swap quote', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get swap quote',
    });
  }
});

/**
 * POST /api/swap/validate
 * Validate swap parameters before execution
 * 
 * Body: {
 *   userAddress: string,
 *   inputToken: string,
 *   inputAmount: string
 * }
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { userAddress, inputToken, inputAmount } = req.body;

    // Validation
    if (!userAddress || !inputToken || !inputAmount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: userAddress, inputToken, inputAmount',
      });
    }

    const amount = BigInt(inputAmount);

    logger.info('Validating swap', { userAddress, inputToken, inputAmount });

    const validation = await swapService.validateSwap(userAddress, inputToken, amount);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
      });
    }

    res.json({
      success: true,
      data: { valid: true },
    });
  } catch (error) {
    logger.error('Failed to validate swap', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to validate swap',
    });
  }
});

/**
 * POST /api/swap/execute
 * Execute a token swap (returns transaction for user to sign)
 * 
 * Body: {
 *   userAddress: string,
 *   inputToken: string,
 *   outputToken: string,
 *   inputAmount: string,
 *   minOutputAmount: string,
 *   gaslessMode: boolean
 * }
 */
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const { userAddress, inputToken, outputToken, inputAmount, minOutputAmount, gaslessMode } = req.body;

    // Validation
    if (!userAddress || !inputToken || !outputToken || !inputAmount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters',
      });
    }

    logger.info('Executing swap', { 
      userAddress, 
      inputToken, 
      outputToken, 
      inputAmount,
      gaslessMode 
    });

    // For now, return success with instructions for client-side execution
    // The actual swap is executed client-side via Stacks wallet
    res.json({
      success: true,
      data: {
        message: 'Swap prepared. Please sign the transaction in your wallet.',
        inputToken,
        outputToken,
        inputAmount,
        minOutputAmount: minOutputAmount || '0',
        gaslessMode: gaslessMode || false,
      },
    });
  } catch (error) {
    logger.error('Failed to execute swap', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to execute swap',
    });
  }
});

export default router;
