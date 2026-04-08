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
    private readonly CACHE_TTL = 30000; // 30 second cache — balances price freshness vs API calls

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
        // ALEX SDK expects its internal token ID (e.g. 'age000-governance-token'), not a full principal.
        // Extract the contract name from the principal if needed.
        const rawTokenIn = (token === 'STX' || token.includes('wstx')) ? 'token-wstx' : token;
        if (rawTokenIn === 'token-wstx') return 1.0;

        // Map full principals to ALEX SDK token IDs
        const PRINCIPAL_TO_ALEX_ID: Record<string, string> = {
            'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex': 'age000-governance-token',
            'SP3Y2ZSH8P7D50B0JLZVGKMBC7PX3RVRGWJKWKY38.token-aeusdc': 'token-aeusdc',
            'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token': 'token-wbtc', // sBTC maps to xBTC in ALEX
            'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx': 'token-susdt',
        };
        const tokenIn = PRINCIPAL_TO_ALEX_ID[rawTokenIn] || rawTokenIn;

        const sources: TokenRateSource[] = [
            {
                name: 'CoinGecko',
                getRate: async (token: string) => {
                    // CoinGecko gives real market USD price — most accurate source
                    const COINGECKO_IDS: Record<string, string> = {
                        'age000-governance-token': 'alexgo',
                        'token-wbtc': 'bitcoin',
                        'token-susdt': 'tether',
                        'token-aeusdc': 'usd-coin',
                        'sbtc-token': 'bitcoin',
                    };
                    const cgId = COINGECKO_IDS[token];
                    if (!cgId) return null;
                    try {
                        const res = await fetch(
                            `https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd`,
                            { signal: AbortSignal.timeout(5000) }
                        );
                        if (res.ok) {
                            const data = await res.json();
                            const usdPrice = data[cgId]?.usd;
                            if (usdPrice && usdPrice > 0) {
                                const stxUsd = await this.getStxPrice();
                                const stxRate = usdPrice / stxUsd;
                                console.log(`Token rate from CoinGecko: ${token} = ${stxRate} STX ($${usdPrice} USD)`);
                                return stxRate;
                            }
                        }
                    } catch (e) {
                        console.warn(`CoinGecko rate fetch failed for ${token}:`, e);
                    }
                    return null;
                }
            },
            {
                name: 'ALEX SDK',
                getRate: async (token: string) => {
                    // ALEX DEX price — fallback only, DEX price can diverge from market
                    try {
                        const unitInMicro = BigInt(10 ** tokenDecimals);
                        const amountOut = await this.alex.getAmountTo(
                            token as any,
                            unitInMicro,
                            'token-wstx' as any
                        );
                        if (amountOut) {
                            const rate = Number(amountOut) / 1_000_000;
                            console.log(`Token rate from ALEX SDK: ${token} = ${rate} STX (decimals=${tokenDecimals})`);
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
                name: 'Hardcoded Fallback',
                getRate: async (token: string) => {
                    console.warn(`All oracle sources failed for ${token}, using 1:1 STX fallback`);
                    return 1.0;
                }
            }
        ];

        // Try each source in order until one succeeds
        for (const source of sources) {
            const rate = await source.getRate(tokenIn);
            if (rate && rate > 0) {
                console.log(`[Oracle] ${token} rate: ${rate} STX/token via ${source.name} (decimals=${tokenDecimals})`);
                // Cache the result
                this.priceCache.set(cacheKey, { price: rate, timestamp: Date.now() });
                return rate;
            }
        }

        // All sources failed — return 1.0 as a safe conservative default
        console.error(`All oracle sources failed for ${token}`);
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
