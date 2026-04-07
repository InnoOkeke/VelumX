import { PricingOracleService } from '../services/PricingOracleService';

// Mock fetch globally
global.fetch = jest.fn();

describe('PricingOracleService', () => {
    let oracle: PricingOracleService;

    beforeEach(() => {
        oracle = new PricingOracleService();
        oracle.clearCache(); // Clear cache before each test
        jest.clearAllMocks();
    });

    describe('getStxPrice', () => {
        test('should fetch STX price from CoinGecko', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ blockstack: { usd: 2.45 } })
            });

            const price = await oracle.getStxPrice();
            expect(price).toBe(2.45);
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('coingecko'),
                expect.any(Object)
            );
        });

        test('should fallback to Binance if CoinGecko fails', async () => {
            // CoinGecko fails
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false
            });

            // CoinMarketCap fails (no API key)
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false
            });

            // Binance succeeds
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ price: '2.50' })
            });

            const price = await oracle.getStxPrice();
            expect(price).toBe(2.50);
        });

        test('should use hardcoded fallback if all sources fail', async () => {
            (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

            const price = await oracle.getStxPrice();
            expect(price).toBe(2.50); // Fallback price
        });

        test('should cache STX price', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ blockstack: { usd: 2.45 } })
            });

            // First call
            const price1 = await oracle.getStxPrice();
            expect(price1).toBe(2.45);
            expect(global.fetch).toHaveBeenCalledTimes(1);

            // Second call should use cache
            const price2 = await oracle.getStxPrice();
            expect(price2).toBe(2.45);
            expect(global.fetch).toHaveBeenCalledTimes(1); // No additional fetch
        });
    });

    describe('getTokenRate', () => {
        test('should return 1.0 for STX/wstx', async () => {
            const rate1 = await oracle.getTokenRate('STX');
            const rate2 = await oracle.getTokenRate('token-wstx');

            expect(rate1).toBe(1.0);
            expect(rate2).toBe(1.0);
        });

        test('should use fallback rates for common tokens', async () => {
            // Mock ALEX SDK failure by not mocking it (will throw)
            const sbtcRate = await oracle.getTokenRate('SP...sbtc');
            const usdcRate = await oracle.getTokenRate('SP...usdc');

            expect(sbtcRate).toBe(20000); // Fallback sBTC rate
            expect(usdcRate).toBe(0.4);   // Fallback USDC rate
        });

        test('should cache token rates', async () => {
            // First call
            const rate1 = await oracle.getTokenRate('SP...usdc');
            expect(rate1).toBe(0.4);

            // Second call should use cache
            const rate2 = await oracle.getTokenRate('SP...usdc');
            expect(rate2).toBe(0.4);
        });

        test('should return 1.0 for unknown tokens', async () => {
            const rate = await oracle.getTokenRate('SP...unknown-token');
            expect(rate).toBe(1.0);
        });
    });

    describe('convertToUsdcx', () => {
        test('should convert token amount to USD', async () => {
            // Mock STX price
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ blockstack: { usd: 2.50 } })
            });

            // 1 USDC (1,000,000 micro units) at 0.4 STX rate and $2.50 STX price
            // = 0.4 STX * $2.50 = $1.00
            const usdValue = await oracle.convertToUsdcx('1000000', 'SP...usdc');
            expect(usdValue).toBeCloseTo(1.0, 2);
        });

        test('should return 0 for zero amount', async () => {
            const usdValue = await oracle.convertToUsdcx('0', 'SP...usdc');
            expect(usdValue).toBe(0);
        });

        test('should handle large amounts', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ blockstack: { usd: 2.50 } })
            });

            // 1 sBTC (1,000,000 micro units) at 20,000 STX rate and $2.50 STX price
            // = 20,000 STX * $2.50 = $50,000
            const usdValue = await oracle.convertToUsdcx('1000000', 'SP...sbtc');
            expect(usdValue).toBeCloseTo(50000, 0);
        });
    });

    describe('cache management', () => {
        test('should clear specific cache entry', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ blockstack: { usd: 2.45 } })
            });

            await oracle.getStxPrice();
            expect(global.fetch).toHaveBeenCalledTimes(1);

            oracle.clearCache('stx-usd');

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ blockstack: { usd: 2.50 } })
            });

            await oracle.getStxPrice();
            expect(global.fetch).toHaveBeenCalledTimes(2); // Cache was cleared
        });

        test('should clear all cache', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({ blockstack: { usd: 2.45 } })
            });

            await oracle.getStxPrice();
            await oracle.getTokenRate('SP...usdc');

            oracle.clearCache(); // Clear all

            await oracle.getStxPrice();
            await oracle.getTokenRate('SP...usdc');

            // Should have made fresh requests after cache clear
            expect(global.fetch).toHaveBeenCalledTimes(2);
        });

        test('should provide cache statistics', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ blockstack: { usd: 2.45 } })
            });

            await oracle.getStxPrice();
            await oracle.getTokenRate('SP...usdc');

            const stats = oracle.getCacheStats();
            expect(stats.size).toBeGreaterThan(0);
            expect(stats.entries).toBeInstanceOf(Array);
            expect(stats.entries[0]).toHaveProperty('key');
            expect(stats.entries[0]).toHaveProperty('price');
            expect(stats.entries[0]).toHaveProperty('age');
        });
    });

    describe('timeout handling', () => {
        test('should timeout slow requests', async () => {
            // Mock a slow response
            (global.fetch as jest.Mock).mockImplementationOnce(() =>
                new Promise((resolve) => setTimeout(resolve, 10000))
            );

            const price = await oracle.getStxPrice();
            expect(price).toBe(2.50); // Should use fallback
        });
    });
});
