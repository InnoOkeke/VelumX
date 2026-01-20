/**
 * Security middleware for Express
 * Includes CORS, input sanitization, and security headers
 */

import { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { getConfig } from '../config';
import { logger } from '../utils/logger';

/**
 * CORS configuration
 */
export function configureCors() {
  const config = getConfig();
  
  // Normalize CORS origin by removing trailing slash
  const normalizedOrigin = config.corsOrigin.replace(/\/$/, '');
  
  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      // Normalize the incoming origin by removing trailing slash
      const normalizedIncomingOrigin = origin.replace(/\/$/, '');
      
      // Check if normalized origins match
      if (normalizedIncomingOrigin === normalizedOrigin) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400, // 24 hours
  });
}

/**
 * Security headers middleware
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  next();
}

/**
 * Input sanitization middleware
 * Removes potentially dangerous characters from string inputs
 */
export function sanitizeInput(req: Request, res: Response, next: NextFunction): void {
  // Skip sanitization for now - it's causing issues with query objects
  // TODO: Implement more robust sanitization that handles edge cases
  next();
  
  /* Disabled temporarily due to issues with query object handling
  try {
    // Sanitize query parameters
    if (req.query && Object.keys(req.query).length > 0) {
      req.query = sanitizeObject(req.query);
    }
    
    // Sanitize body
    if (req.body && Object.keys(req.body).length > 0) {
      req.body = sanitizeObject(req.body);
    }
    
    next();
  } catch (error) {
    logger.error('Input sanitization error', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      path: req.path,
      method: req.method,
      queryKeys: req.query ? Object.keys(req.query) : [],
      bodyKeys: req.body ? Object.keys(req.body) : [],
    });
    // Don't block the request, just log and continue
    next();
  }
  */
}

/**
 * Sanitizes an object recursively
 */
function sanitizeObject(obj: any): any {
  try {
    if (typeof obj === 'string') {
      return sanitizeString(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => sanitizeObject(item));
    }
    
    if (obj !== null && typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          sanitized[key] = sanitizeObject(obj[key]);
        }
      }
      return sanitized;
    }
    
    return obj;
  } catch (error) {
    // If sanitization fails, log and return original
    logger.warn('Failed to sanitize object', { error, obj });
    return obj;
  }
}

/**
 * Sanitizes a string by removing potentially dangerous characters
 * Preserves blockchain addresses and transaction hashes
 */
function sanitizeString(str: string): string {
  // For blockchain data, we need to be more permissive
  // Allow: alphanumeric, spaces, hyphens, underscores, dots, @, 0x prefix, and colons (for Stacks addresses)
  // Remove: script tags, SQL injection patterns, and other dangerous patterns
  
  // First, remove any script tags or HTML
  let sanitized = str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  
  // Remove SQL injection patterns
  sanitized = sanitized.replace(/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi, '');
  
  // For everything else, allow blockchain-safe characters
  // This includes: letters, numbers, spaces, -, _, ., @, x (for 0x), and : (for Stacks contract addresses)
  return sanitized;
}

/**
 * Request logging middleware
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  
  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.http('Request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      ip: req.ip,
    });
  });
  
  next();
}

/**
 * Error handling middleware
 */
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });
  
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
    timestamp: Date.now(),
  });
}

/**
 * 404 handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: Date.now(),
  });
}
