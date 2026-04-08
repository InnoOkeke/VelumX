import { AlexSDK } from 'alex-sdk';

/**
 * Pricing Oracle Service with multiple fallback sources
 * Provides reliable token pricing even when primary sources fail
 */

interface PriceSource {
    name: string;
    getPrice: () => Promise<number | null>;
}

interface TokenRateSource {
    name: string;
    getRate: (token: string) => Promise<number | null>;
}

export class PricingOracleService {
    private alex: AlexSDK;
    private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
    private readonly CACHE_TTL = 60000; // 1 minute cache

    constructor() {
        this.alex = new AlexSDK();
    }

    /**
     * Get STX price in USD with multiple oracle fallbacks
     */
    public async getStxPrice(): Promise<number> {
        const cacheKey = 'stx-usd';
        const cached = this.priceCache.get(cacheKey);

        // Return cached price if still valid
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.price;
        }

        const sources: PriceSource[] = [
            {
                name: 'CoinGecko',
                getPrice: async () => {
                    try {
                        const response = await fetch(
                            'https://api.coingecko.com/api/v3/simple/price?ids=blockstack&vs_currencies=usd',
                            { signal: AbortSignal.timeout(5000) }
                        );
                        if (response.ok) {
                            const data = await response.json();
                            return data.blockstack?.usd || null;
                        }
                        return null;
                    } catch (e) {
                        console.warn('CoinGecko STX price fetch failed:', e);
                        return null;
                    }
                }
            },
            {
                name: 'CoinMarketCap',
                getPrice: async () => {
                    try {
                        // Note: Requires API key for production use
                        // This is a placeholder for the implementation
                        const response = await fetch(
                            'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=STX',
                            {
                                headers: {
                                    'X-CMC_PRO_API_KEY': process.env.COINMARKETCAP_API_KEY || ''
                                },
                                signal: AbortSignal.timeout(5000)
                            }
                        );
                        if (response.ok && process.env.COINMARKETCAP_API_KEY) {
                            const data = await response.json();
                            return data.data?.STX?.quote?.USD?.price || null;
                        }
                        return null;
                    } catch (e) {
                        console.warn('CoinMarketCap STX price fetch failed:', e);
                        return null;
                    }
                }
            },
            {
                name: 'Binance',
                getPrice: async () => {
                    try {
                        const response = await fetch(
                            'https://api.binance.com/api/v3/ticker/price?symbol=STXUSDT',
                            { signal: AbortSignal.timeout(5000) }
                        );
                        if (response.ok) {
                            const data = await response.json();
                            return parseFloat(data.price) || null;
                        }
                        return null;
                    } catch (e) {
                        console.warn('Binance STX price fetch failed:', e);
                        return null;
                    }
                }
            },
            {
                name: 'Fallback',
                getPrice: async () => {
                    console.warn('Using fallback STX price');
                    return 2.50; // Conservative fallback
                }
            }
        ];

        // Try each source in order until one succeeds
        for (const source of sources) {
            const price = await source.getPrice();
            if (price && price > 0) {
                console.log(`STX price from ${source.name}: $${price}`);
                
                // Cache the result
                this.priceCache.set(cacheKey, { price, timestamp: Date.now() });
                
                return price;
            }
        }

        // Should never reach here due to fallback, but just in case
        return 2.50;
    }

    /**
     * Get token rate relative to STX with multiple oracle fallbacks.
     * @param token - Token identifier (contract principal or ALEX SDK ID)
     * @param tokenDecimals - Actual decimals of the token (default 6). Used to price
     *                        exactly 1 full token via the ALEX SDK.
     */
    public async getTokenRate(token: string, tokenDecimals: number = 6): Promise<number> {
        const cacheKey = `token-rate-${token}-${tokenDecimals}`;
        const cached = this.priceCache.get(cacheKey);

        // Return cached rate if still valid
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.price;
        }

        // Standardize token identifier
        const tokenIn = (token === 'STX' || token.includes('wstx')) ? 'token-wstx' : token;
        if (tokenIn === 'token-wstx') return 1.0;

        const sources: TokenRateSource[] = [
            {
                name: 'ALEX SDK',
                getRate: async (token: string) => {
                    try {
                        // Use exactly 1 full token in micro units based on actual decimals.
                        // Previously hardcoded to 1_000_000 (assumes 6 decimals), which was
                        // wrong for tokens like sBTC (8 decimals) or any non-6-decimal token.
                        const unitInMicro = BigInt(10 ** tokenDecimals);
                        const amountOut = await this.alex.getAmountTo(
                            token as any,
                            unitInMicro,
                            'token-wstx' as any
                        );

                        if (amountOut) {
                            // wSTX always has 6 decimals, so divide output by 1_000_000
                            const rate = Number(amountOut) / 1_000_000;
                            console.log(`Token rate from ALEX: ${token} = ${rate} STX (decimals=${tokenDecimals})`);
                            return rate;
                        }
                        return null;
                    } catch (e) {
                        console.warn(`ALEX SDK rate fetch failed for ${token}:`, e);
                        return null;
                    }
                }
            },
            {
                name: 'Velar DEX',
                getRate: async (token: string) => {
                    try {
                        // Placeholder for Velar DEX integration
                        // Would require Velar SDK or direct contract calls
                        console.log(`Velar DEX integration not yet implemented for ${token}`);
                        return null;
                    } catch (e) {
                        console.warn(`Velar DEX rate fetch failed for ${token}:`, e);
                        return null;
                    }
                }
            },
            {
                name: 'Hardcoded Fallback',
                getRate: async (token: string) => {
                    // Conservative fallback rates for common tokens
                    const fallbackRates: Record<string, number> = {
                        'sbtc': 20000,      // ~20k STX per BTC (conservative)
                        'usdc': 0.4,        // ~0.4 STX per USD (conservative)
                        'usdcx': 0.4,       // ~0.4 STX per USD
                        'alex': 0.5,        // ~0.5 STX per ALEX
                        'aeusdc': 0.4,      // ~0.4 STX per aeUSDC
                    };

                    for (const [key, rate] of Object.entries(fallbackRates)) {
                        if (token.toLowerCase().includes(key)) {
                            console.warn(`Using fallback rate for ${token}: ${rate} STX`);
                            return rate;
                        }
                    }

                    console.warn(`No fallback rate found for ${token}, using 1.0`);
                    return 1.0; // Default 1:1 if unknown
                }
            }
        ];

        // Try each source in order until one succeeds
        for (const source of sources) {
            const rate = await source.getRate(tokenIn);
            if (rate && rate > 0) {
                // Cache the result
                this.priceCache.set(cacheKey, { price: rate, timestamp: Date.now() });
                return rate;
            }
        }

        // Fallback to 1.0 if all sources fail
        return 1.0;
    }

    /**
     * Convert any token amount to its USDCx (USD) equivalent
     */
    public async convertToUsdcx(amount: string | bigint, token: string, tokenDecimals: number = 6): Promise<number> {
        const rawAmount = BigInt(amount);
        if (rawAmount === BigInt(0)) return 0;

        const tokenStxRate = await this.getTokenRate(token, tokenDecimals);
        const stxUsdPrice = await this.getStxPrice();

        // Convert token micro-amount to full tokens using actual decimals
        const amountInStx = (Number(rawAmount) / Math.pow(10, tokenDecimals)) * tokenStxRate;

        // Convert STX to USD (USDCx)
        const amountInUsdcx = amountInStx * stxUsdPrice;

        return amountInUsdcx;
    }

    /**
     * Clear cache for a specific key or all cache
     */
    public clearCache(key?: string) {
        if (key) {
            this.priceCache.delete(key);
        } else {
            this.priceCache.clear();
        }
    }

    /**
     * Get cache statistics
     */
    public getCacheStats() {
        return {
            size: this.priceCache.size,
            entries: Array.from(this.priceCache.entries()).map(([key, value]) => ({
                key,
                price: value.price,
                age: Date.now() - value.timestamp
            }))
        };
    }
}
