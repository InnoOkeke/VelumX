/**
 * Rate limiting middleware
 * Prevents abuse by limiting requests per IP address
 */

import rateLimit from 'express-rate-limit';
import { getConfig } from '../config';
import { logger } from '../utils/logger';

/**
 * Creates rate limiter middleware
 * Limits requests to maxRequestsPerMinute per IP address
 */
export function createRateLimiter() {
  const config = getConfig();
  
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    max: config.maxRequestsPerMinute, // Limit each IP to max requests per windowMs
    message: {
      error: 'Too many requests',
      message: `Rate limit exceeded. Maximum ${config.maxRequestsPerMinute} requests per minute allowed.`,
      retryAfter: 60, // seconds
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    
    // Custom handler for rate limit exceeded
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method,
      });
      
      res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Maximum ${config.maxRequestsPerMinute} requests per minute allowed.`,
        retryAfter: 60,
        timestamp: Date.now(),
      });
    },
    
    // Skip rate limiting for health check
    skip: (req) => req.path === '/api/health',
  });
}

/**
 * Stricter rate limiter for sensitive endpoints
 * (e.g., transaction submission, paymaster operations)
 */
export function createStrictRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    max: 10, // Limit to 10 requests per minute for sensitive operations
    message: {
      error: 'Too many requests',
      message: 'Rate limit exceeded for this operation. Please try again later.',
      retryAfter: 60,
    },
    standardHeaders: true,
    legacyHeaders: false,
    
    handler: (req, res) => {
      logger.warn('Strict rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method,
      });
      
      res.status(429).json({
        error: 'Too many requests',
        message: 'Rate limit exceeded for this operation. Please try again later.',
        retryAfter: 60,
        timestamp: Date.now(),
      });
    },
  });
}
