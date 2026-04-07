import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
    [key: string]: {
        count: number;
        resetTime: number;
    };
}

interface RateLimitConfig {
    windowMs: number;      // Time window in milliseconds
    maxRequests: number;   // Max requests per window
    message?: string;      // Custom error message
}

/**
 * In-memory rate limiter for API key-based throttling
 * For production, consider using Redis for distributed rate limiting
 */
export class RateLimiter {
    private store: RateLimitStore = {};
    private config: RateLimitConfig;

    constructor(config: RateLimitConfig) {
        this.config = {
            windowMs: config.windowMs || 60000, // Default: 1 minute
            maxRequests: config.maxRequests || 100, // Default: 100 requests/min
            message: config.message || 'Too many requests, please try again later.'
        };

        // Cleanup expired entries every minute
        setInterval(() => this.cleanup(), 60000);
    }

    /**
     * Middleware function to rate limit requests per API key
     */
    public middleware() {
        return (req: Request & { apiKeyId?: string }, res: Response, next: NextFunction) => {
            const identifier = req.apiKeyId || req.ip || 'anonymous';
            const now = Date.now();

            // Initialize or get existing record
            if (!this.store[identifier] || now > this.store[identifier].resetTime) {
                this.store[identifier] = {
                    count: 0,
                    resetTime: now + this.config.windowMs
                };
            }

            const record = this.store[identifier];

            // Check if limit exceeded
            if (record.count >= this.config.maxRequests) {
                const retryAfter = Math.ceil((record.resetTime - now) / 1000);
                
                res.setHeader('X-RateLimit-Limit', this.config.maxRequests.toString());
                res.setHeader('X-RateLimit-Remaining', '0');
                res.setHeader('X-RateLimit-Reset', record.resetTime.toString());
                res.setHeader('Retry-After', retryAfter.toString());

                return res.status(429).json({
                    error: 'Rate limit exceeded',
                    message: this.config.message,
                    retryAfter: retryAfter
                });
            }

            // Increment counter
            record.count++;

            // Set rate limit headers
            res.setHeader('X-RateLimit-Limit', this.config.maxRequests.toString());
            res.setHeader('X-RateLimit-Remaining', (this.config.maxRequests - record.count).toString());
            res.setHeader('X-RateLimit-Reset', record.resetTime.toString());

            next();
        };
    }

    /**
     * Clean up expired entries from store
     */
    private cleanup() {
        const now = Date.now();
        Object.keys(this.store).forEach(key => {
            if (now > this.store[key].resetTime) {
                delete this.store[key];
            }
        });
    }

    /**
     * Reset rate limit for a specific identifier (useful for testing)
     */
    public reset(identifier: string) {
        delete this.store[identifier];
    }

    /**
     * Get current stats for an identifier
     */
    public getStats(identifier: string) {
        return this.store[identifier] || null;
    }
}

/**
 * Create different rate limiters for different endpoint types
 */
export const createRateLimiters = () => {
    return {
        // Strict limit for estimation endpoint (prevents abuse)
        estimate: new RateLimiter({
            windowMs: 60000,        // 1 minute
            maxRequests: 60,        // 60 requests per minute
            message: 'Too many fee estimation requests. Please slow down.'
        }),

        // Moderate limit for sponsorship endpoint (critical path)
        sponsor: new RateLimiter({
            windowMs: 60000,        // 1 minute
            maxRequests: 30,        // 30 transactions per minute
            message: 'Too many sponsorship requests. Please slow down.'
        }),

        // Strict limit for broadcast endpoint (prevents transaction spam)
        broadcast: new RateLimiter({
            windowMs: 60000,        // 1 minute
            maxRequests: 20,        // 20 broadcasts per minute
            message: 'Too many broadcast requests. Please slow down.'
        }),

        // Lenient limit for dashboard endpoints
        dashboard: new RateLimiter({
            windowMs: 60000,        // 1 minute
            maxRequests: 120,       // 120 requests per minute
            message: 'Too many dashboard requests. Please slow down.'
        })
    };
};
