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
  try {
    // Sanitize query parameters
    if (req.query) {
      req.query = sanitizeObject(req.query);
    }
    
    // Sanitize body
    if (req.body) {
      req.body = sanitizeObject(req.body);
    }
    
    next();
  } catch (error) {
    logger.error('Input sanitization error', { error });
    res.status(400).json({
      error: 'Invalid input',
      message: 'Request contains invalid characters',
    });
  }
}

/**
 * Sanitizes an object recursively
 */
function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  if (obj !== null && typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        sanitized[key] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  }
  
  return obj;
}

/**
 * Sanitizes a string by removing potentially dangerous characters
 * Preserves blockchain addresses and transaction hashes
 */
function sanitizeString(str: string): string {
  // Allow alphanumeric, spaces, and common safe characters
  // Also allow 0x prefix for addresses and hashes
  // Allow dots for contract addresses (Stacks)
  return str.replace(/[^\w\s\-_.@0x]/gi, '');
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
