/**
 * Validation middleware for API requests
 * Provides request validation and error handling for liquidity operations
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Validation error response interface
 */
interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

/**
 * Validates Stacks contract address format
 */
function isValidStacksAddress(address: string): boolean {
  // Format: PRINCIPAL.CONTRACT-NAME or just PRINCIPAL for STX
  if (address === 'STX') return true;
  
  const parts = address.split('.');
  if (parts.length !== 2) return false;
  
  // Check principal (address) format
  const principal = parts[0];
  if (!principal.match(/^(ST|SP)[0-9A-Z]{38,41}$/)) return false;
  
  // Check contract name format
  const contractName = parts[1];
  if (!contractName.match(/^[a-z][a-z0-9-]{0,39}$/)) return false;
  
  return true;
}

/**
 * Validates bigint string format
 */
function isValidBigIntString(value: string): boolean {
  try {
    BigInt(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates that a bigint string is positive
 */
function isPositiveBigInt(value: string): boolean {
  try {
    return BigInt(value) > BigInt(0);
  } catch {
    return false;
  }
}

/**
 * Validates add liquidity request body
 */
export function validateAddLiquidity(req: Request, res: Response, next: NextFunction): void {
  const errors: ValidationError[] = [];
  const {
    tokenA,
    tokenB,
    amountADesired,
    amountBDesired,
    amountAMin,
    amountBMin,
    userAddress,
    gaslessMode,
  } = req.body;

  // Required field validation
  if (!tokenA) {
    errors.push({ field: 'tokenA', message: 'Token A address is required' });
  } else if (!isValidStacksAddress(tokenA)) {
    errors.push({ field: 'tokenA', message: 'Invalid token A address format', value: tokenA });
  }

  if (!tokenB) {
    errors.push({ field: 'tokenB', message: 'Token B address is required' });
  } else if (!isValidStacksAddress(tokenB)) {
    errors.push({ field: 'tokenB', message: 'Invalid token B address format', value: tokenB });
  }

  if (tokenA && tokenB && tokenA === tokenB) {
    errors.push({ field: 'tokens', message: 'Token A and Token B cannot be the same' });
  }

  if (!amountADesired) {
    errors.push({ field: 'amountADesired', message: 'Amount A desired is required' });
  } else if (!isValidBigIntString(amountADesired)) {
    errors.push({ field: 'amountADesired', message: 'Invalid amount A format', value: amountADesired });
  } else if (!isPositiveBigInt(amountADesired)) {
    errors.push({ field: 'amountADesired', message: 'Amount A must be greater than zero' });
  }

  if (!amountBDesired) {
    errors.push({ field: 'amountBDesired', message: 'Amount B desired is required' });
  } else if (!isValidBigIntString(amountBDesired)) {
    errors.push({ field: 'amountBDesired', message: 'Invalid amount B format', value: amountBDesired });
  } else if (!isPositiveBigInt(amountBDesired)) {
    errors.push({ field: 'amountBDesired', message: 'Amount B must be greater than zero' });
  }

  if (!userAddress) {
    errors.push({ field: 'userAddress', message: 'User address is required' });
  } else if (!isValidStacksAddress(userAddress.split('.')[0])) {
    errors.push({ field: 'userAddress', message: 'Invalid user address format', value: userAddress });
  }

  // Optional field validation
  if (amountAMin && !isValidBigIntString(amountAMin)) {
    errors.push({ field: 'amountAMin', message: 'Invalid minimum amount A format', value: amountAMin });
  }

  if (amountBMin && !isValidBigIntString(amountBMin)) {
    errors.push({ field: 'amountBMin', message: 'Invalid minimum amount B format', value: amountBMin });
  }

  if (gaslessMode !== undefined && typeof gaslessMode !== 'boolean') {
    errors.push({ field: 'gaslessMode', message: 'Gasless mode must be a boolean', value: gaslessMode });
  }

  if (errors.length > 0) {
    logger.warn('Add liquidity validation failed', { errors, body: req.body });
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors,
      timestamp: new Date(),
    });
    return;
  }

  next();
}

/**
 * Validates remove liquidity request body
 */
export function validateRemoveLiquidity(req: Request, res: Response, next: NextFunction): void {
  const errors: ValidationError[] = [];
  const {
    tokenA,
    tokenB,
    liquidity,
    amountAMin,
    amountBMin,
    userAddress,
    gaslessMode,
  } = req.body;

  // Required field validation
  if (!tokenA) {
    errors.push({ field: 'tokenA', message: 'Token A address is required' });
  } else if (!isValidStacksAddress(tokenA)) {
    errors.push({ field: 'tokenA', message: 'Invalid token A address format', value: tokenA });
  }

  if (!tokenB) {
    errors.push({ field: 'tokenB', message: 'Token B address is required' });
  } else if (!isValidStacksAddress(tokenB)) {
    errors.push({ field: 'tokenB', message: 'Invalid token B address format', value: tokenB });
  }

  if (tokenA && tokenB && tokenA === tokenB) {
    errors.push({ field: 'tokens', message: 'Token A and Token B cannot be the same' });
  }

  if (!liquidity) {
    errors.push({ field: 'liquidity', message: 'LP token amount is required' });
  } else if (!isValidBigIntString(liquidity)) {
    errors.push({ field: 'liquidity', message: 'Invalid LP token amount format', value: liquidity });
  } else if (!isPositiveBigInt(liquidity)) {
    errors.push({ field: 'liquidity', message: 'LP token amount must be greater than zero' });
  }

  if (!userAddress) {
    errors.push({ field: 'userAddress', message: 'User address is required' });
  } else if (!isValidStacksAddress(userAddress.split('.')[0])) {
    errors.push({ field: 'userAddress', message: 'Invalid user address format', value: userAddress });
  }

  // Optional field validation
  if (amountAMin && !isValidBigIntString(amountAMin)) {
    errors.push({ field: 'amountAMin', message: 'Invalid minimum amount A format', value: amountAMin });
  }

  if (amountBMin && !isValidBigIntString(amountBMin)) {
    errors.push({ field: 'amountBMin', message: 'Invalid minimum amount B format', value: amountBMin });
  }

  if (gaslessMode !== undefined && typeof gaslessMode !== 'boolean') {
    errors.push({ field: 'gaslessMode', message: 'Gasless mode must be a boolean', value: gaslessMode });
  }

  if (errors.length > 0) {
    logger.warn('Remove liquidity validation failed', { errors, body: req.body });
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors,
      timestamp: new Date(),
    });
    return;
  }

  next();
}

/**
 * Validates pool ID parameter format
 */
export function validatePoolId(req: Request, res: Response, next: NextFunction): void {
  const poolId = Array.isArray(req.params.poolId) ? req.params.poolId[0] : req.params.poolId;

  if (!poolId) {
    res.status(400).json({
      success: false,
      error: 'Pool ID is required',
      timestamp: new Date(),
    });
    return;
  }

  // Pool ID should be in format: tokenA-tokenB
  const tokens = poolId.split('-');
  if (tokens.length !== 2) {
    res.status(400).json({
      success: false,
      error: 'Invalid pool ID format. Expected: tokenA-tokenB',
      value: poolId,
      timestamp: new Date(),
    });
    return;
  }

  const [tokenA, tokenB] = tokens;
  const errors: ValidationError[] = [];

  if (!isValidStacksAddress(tokenA)) {
    errors.push({ field: 'tokenA', message: 'Invalid token A address in pool ID', value: tokenA });
  }

  if (!isValidStacksAddress(tokenB)) {
    errors.push({ field: 'tokenB', message: 'Invalid token B address in pool ID', value: tokenB });
  }

  if (errors.length > 0) {
    logger.warn('Pool ID validation failed', { errors, poolId });
    res.status(400).json({
      success: false,
      error: 'Invalid pool ID format',
      details: errors,
      timestamp: new Date(),
    });
    return;
  }

  next();
}

/**
 * Validates user address parameter
 */
export function validateUserAddress(req: Request, res: Response, next: NextFunction): void {
  const address = Array.isArray(req.params.address) ? req.params.address[0] : req.params.address;

  if (!address) {
    res.status(400).json({
      success: false,
      error: 'User address is required',
      timestamp: new Date(),
    });
    return;
  }

  // For user addresses, we only need to validate the principal part
  const principal = address.split('.')[0];
  if (!isValidStacksAddress(principal)) {
    res.status(400).json({
      success: false,
      error: 'Invalid user address format',
      value: address,
      timestamp: new Date(),
    });
    return;
  }

  next();
}

/**
 * Validates pagination query parameters
 */
export function validatePagination(req: Request, res: Response, next: NextFunction): void {
  const { page, limit } = req.query;
  const errors: ValidationError[] = [];

  if (page) {
    const pageNum = parseInt(page as string);
    if (isNaN(pageNum) || pageNum < 1) {
      errors.push({ field: 'page', message: 'Page must be a positive integer', value: page });
    } else if (pageNum > 1000) {
      errors.push({ field: 'page', message: 'Page cannot exceed 1000', value: page });
    }
  }

  if (limit) {
    const limitNum = parseInt(limit as string);
    if (isNaN(limitNum) || limitNum < 1) {
      errors.push({ field: 'limit', message: 'Limit must be a positive integer', value: limit });
    } else if (limitNum > 200) {
      errors.push({ field: 'limit', message: 'Limit cannot exceed 200', value: limit });
    }
  }

  if (errors.length > 0) {
    logger.warn('Pagination validation failed', { errors, query: req.query });
    res.status(400).json({
      success: false,
      error: 'Invalid pagination parameters',
      details: errors,
      timestamp: new Date(),
    });
    return;
  }

  next();
}

/**
 * Validates calculate optimal amounts request body
 */
export function validateCalculateOptimal(req: Request, res: Response, next: NextFunction): void {
  const errors: ValidationError[] = [];
  const { tokenA, tokenB, amountA, amountB } = req.body;

  // Required field validation
  if (!tokenA) {
    errors.push({ field: 'tokenA', message: 'Token A address is required' });
  } else if (!isValidStacksAddress(tokenA)) {
    errors.push({ field: 'tokenA', message: 'Invalid token A address format', value: tokenA });
  }

  if (!tokenB) {
    errors.push({ field: 'tokenB', message: 'Token B address is required' });
  } else if (!isValidStacksAddress(tokenB)) {
    errors.push({ field: 'tokenB', message: 'Invalid token B address format', value: tokenB });
  }

  if (tokenA && tokenB && tokenA === tokenB) {
    errors.push({ field: 'tokens', message: 'Token A and Token B cannot be the same' });
  }

  // At least one amount must be provided
  if (!amountA && !amountB) {
    errors.push({ field: 'amounts', message: 'Either amountA or amountB must be provided' });
  }

  // Validate provided amounts
  if (amountA) {
    if (!isValidBigIntString(amountA)) {
      errors.push({ field: 'amountA', message: 'Invalid amount A format', value: amountA });
    } else if (!isPositiveBigInt(amountA)) {
      errors.push({ field: 'amountA', message: 'Amount A must be greater than zero' });
    }
  }

  if (amountB) {
    if (!isValidBigIntString(amountB)) {
      errors.push({ field: 'amountB', message: 'Invalid amount B format', value: amountB });
    } else if (!isPositiveBigInt(amountB)) {
      errors.push({ field: 'amountB', message: 'Amount B must be greater than zero' });
    }
  }

  if (errors.length > 0) {
    logger.warn('Calculate optimal validation failed', { errors, body: req.body });
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors,
      timestamp: new Date(),
    });
    return;
  }

  next();
}

/**
 * Generic error handler for validation middleware
 */
export function validationErrorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  if (err.name === 'ValidationError') {
    logger.warn('Validation error', { error: err.message, path: req.path });
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      message: err.message,
      timestamp: new Date(),
    });
    return;
  }

  next(err);
}

/**
 * Request size limiter middleware
 */
export function limitRequestSize(maxSize: string = '10mb') {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = req.get('content-length');
    if (contentLength) {
      const sizeInBytes = parseInt(contentLength);
      const maxSizeInBytes = parseSize(maxSize);
      
      if (sizeInBytes > maxSizeInBytes) {
        logger.warn('Request size exceeded', { 
          size: sizeInBytes, 
          maxSize: maxSizeInBytes, 
          path: req.path 
        });
        return res.status(413).json({
          success: false,
          error: 'Request too large',
          message: `Request size exceeds maximum allowed size of ${maxSize}`,
          timestamp: new Date(),
        });
      }
    }
    next();
  };
}

/**
 * Parse size string to bytes
 */
function parseSize(size: string): number {
  const units: { [key: string]: number } = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };

  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2] || 'b';
  
  return Math.floor(value * units[unit]);
}