import { RateLimiter } from '../middleware/rateLimiter';
import { Request, Response } from 'express';

describe('RateLimiter', () => {
    let rateLimiter: RateLimiter;
    let mockReq: Partial<Request & { apiKeyId?: string }>;
    let mockRes: Partial<Response>;
    let mockNext: jest.Mock;

    beforeEach(() => {
        rateLimiter = new RateLimiter({
            windowMs: 60000,
            maxRequests: 5,
            message: 'Test rate limit exceeded'
        });

        mockReq = {
            apiKeyId: 'test-key-123',
            ip: '127.0.0.1'
        };

        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
            setHeader: jest.fn()
        };

        mockNext = jest.fn();
    });

    afterEach(() => {
        rateLimiter.reset('test-key-123');
    });

    test('should allow requests within limit', () => {
        const middleware = rateLimiter.middleware();

        // Make 5 requests (within limit)
        for (let i = 0; i < 5; i++) {
            middleware(mockReq as any, mockRes as any, mockNext);
        }

        expect(mockNext).toHaveBeenCalledTimes(5);
        expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('should block requests exceeding limit', () => {
        const middleware = rateLimiter.middleware();

        // Make 6 requests (1 over limit)
        for (let i = 0; i < 6; i++) {
            middleware(mockReq as any, mockRes as any, mockNext);
        }

        expect(mockNext).toHaveBeenCalledTimes(5);
        expect(mockRes.status).toHaveBeenCalledWith(429);
        expect(mockRes.json).toHaveBeenCalledWith(
            expect.objectContaining({
                error: 'Rate limit exceeded',
                message: 'Test rate limit exceeded'
            })
        );
    });

    test('should set rate limit headers', () => {
        const middleware = rateLimiter.middleware();
        middleware(mockReq as any, mockRes as any, mockNext);

        expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '5');
        expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');
        expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
    });

    test('should reset after time window', (done) => {
        const shortLimiter = new RateLimiter({
            windowMs: 100, // 100ms window
            maxRequests: 2
        });

        const middleware = shortLimiter.middleware();

        // Exhaust limit
        middleware(mockReq as any, mockRes as any, mockNext);
        middleware(mockReq as any, mockRes as any, mockNext);
        middleware(mockReq as any, mockRes as any, mockNext);

        expect(mockNext).toHaveBeenCalledTimes(2);
        expect(mockRes.status).toHaveBeenCalledWith(429);

        // Wait for window to reset
        setTimeout(() => {
            mockNext.mockClear();
            (mockRes.status as jest.Mock).mockClear();

            middleware(mockReq as any, mockRes as any, mockNext);
            expect(mockNext).toHaveBeenCalledTimes(1);
            expect(mockRes.status).not.toHaveBeenCalled();
            done();
        }, 150);
    });

    test('should track different identifiers separately', () => {
        const middleware = rateLimiter.middleware();

        const req1 = { ...mockReq, apiKeyId: 'key-1' };
        const req2 = { ...mockReq, apiKeyId: 'key-2' };

        // Exhaust limit for key-1
        for (let i = 0; i < 6; i++) {
            middleware(req1 as any, mockRes as any, mockNext);
        }

        expect(mockNext).toHaveBeenCalledTimes(5);

        // key-2 should still work
        mockNext.mockClear();
        middleware(req2 as any, mockRes as any, mockNext);
        expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('should use IP as fallback identifier', () => {
        const middleware = rateLimiter.middleware();
        const reqWithoutKey = { ip: '192.168.1.1' };

        middleware(reqWithoutKey as any, mockRes as any, mockNext);
        expect(mockNext).toHaveBeenCalledTimes(1);
    });

    test('should provide stats for identifier', () => {
        const middleware = rateLimiter.middleware();
        middleware(mockReq as any, mockRes as any, mockNext);

        const stats = rateLimiter.getStats('test-key-123');
        expect(stats).toBeTruthy();
        expect(stats?.count).toBe(1);
        expect(stats?.resetTime).toBeGreaterThan(Date.now());
    });

    test('should manually reset identifier', () => {
        const middleware = rateLimiter.middleware();

        // Exhaust limit
        for (let i = 0; i < 6; i++) {
            middleware(mockReq as any, mockRes as any, mockNext);
        }

        expect(mockNext).toHaveBeenCalledTimes(5);

        // Reset and try again
        rateLimiter.reset('test-key-123');
        mockNext.mockClear();
        (mockRes.status as jest.Mock).mockClear();

        middleware(mockReq as any, mockRes as any, mockNext);
        expect(mockNext).toHaveBeenCalledTimes(1);
        expect(mockRes.status).not.toHaveBeenCalled();
    });
});
