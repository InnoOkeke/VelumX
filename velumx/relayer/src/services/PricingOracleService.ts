import { AlexSDK } from 'alex-sdk';
import { Redis } from 'ioredis';

interface PriceSource {
    name: string;
    getPrice: () => Promise<number | null>;
}

interface TokenUsdSource {
    name: string;
    getUsdPrice: (token: string) => Promise<number | null>;
}

// Redis-backed cache with in-memory fallback.
// If REDIS_URL is not set, falls back to a plain Map (single-instance only).
class PriceCache {
    private redis: Redis | null = null;
    private memory: Map<string, { price: number; timestamp: number }> = new Map();
    private readonly TTL_MS: number;
    private readonly TTL_SECONDS: number;

    constructor(ttlMs: number) {
        this.TTL_MS = ttlMs;
        this.TTL_SECONDS = Math.floor(ttlMs / 1000);

        const redisUrl = process.env.REDIS_URL;
        if (redisUrl) {
            this.redis = new Redis(redisUrl, {
                maxRetriesPerRequest: 1,
                connectTimeout: 3000,
                lazyConnect: true,
                enableOfflineQueue: false, // don't queue commands when disconnected
            });
            this.redis.connect().catch(() => {
                console.warn('[Oracle] Redis connection failed — falling back to in-memory cache');
                this.redis = null;
            });
            this.redis.on('error', () => {
                // Suppress ioredis error events after initial failure
            });
        } else {
            console.log('[Oracle] REDIS_URL not set — using in-memory price cache');
        }
    }

    async get(key: string): Promise<number | null> {
        // Try Redis first
        if (this.redis) {
            try {
                const val = await this.redis.get(`oracle:${key}`);
                if (val !== null) return parseFloat(val);
            } catch { /* fall through to memory */ }
        }

        // In-memory fallback
        const entry = this.memory.get(key);
        if (entry && Date.now() - entry.timestamp < this.TTL_MS) return entry.price;
        return null;
    }

    async set(key: string, price: number): Promise<void> {
        // Write to Redis with TTL
        if (this.redis) {
            try {
                await this.redis.set(`oracle:${key}`, price.toString(), 'EX', this.TTL_SECONDS);
            } catch { /* fall through to memory */ }
        }

        // Always write to memory as well (instant reads, Redis-independent)
        this.memory.set(key, { price, timestamp: Date.now() });
    }

    async del(key?: string): Promise<void> {
        if (key) {
            this.memory.delete(key);
            if (this.redis) {
                try { await this.redis.del(`oracle:${key}`); } catch {}
            }
        } else {
            this.memory.clear();
            if (this.redis) {
                try {
                    const keys = await this.redis.keys('oracle:*');
                    if (keys.length > 0) await this.redis.del(...keys);
                } catch {}
            }
        }
    }

    stats() {
        return { memoryEntries: this.memory.size, redisConnected: this.redis !== null };
    }
}

/**
 * Pricing Oracle Service
 * Source priority: ALEX SDK (on-chain) → Binance → CoinCap → CoinGecko
 * Cache: Redis (5 min TTL) with in-memory fallback
 */
export class PricingOracleService {
    private alex: AlexSDK;
    // 5-minute TTL — token prices don't move enough in 5 min to affect fee accuracy
    private readonly cache = new PriceCache(5 * 60 * 1000);
    private metadataCache: Map<string, { symbol: string, decimals: number }> = new Map();

    private readonly KNOWN_DECIMALS: Record<string, number> = {
        'token-alex': 8, 'age000-governance-token': 8,
        'sbtc-token': 8, 'token-wbtc': 8,
        'usdcx': 6, 'token-aeusdc': 6, 'aeusdc': 6,
        'token-wstx': 6, 'stx': 6, 'token-susdt': 8,
        'token-ausd': 8, // aUSD on ALEX DEX
    };

    // Stablecoins — always $1, no oracle needed
    private readonly STABLECOINS = new Set([
        'token-aeusdc', 'aeusdc', 'token-susdt', 'usdcx', 'token-ausd',
        'SP3Y2ZSH8P7D50B0JLZVGKMBC7PX3RVRGWJKWKY38.token-aeusdc',
        'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx',
    ]);

    // Full Stacks principal → ALEX SDK internal token ID
    private readonly PRINCIPAL_TO_ALEX_ID: Record<string, string> = {
        'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex': 'age000-governance-token',
        'SP3Y2ZSH8P7D50B0JLZVGKMBC7PX3RVRGWJKWKY38.token-aeusdc': 'token-aeusdc',
        'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token': 'token-wbtc',
        'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx': 'token-susdt',
    };

    // ALEX SDK ID → Binance spot pair
    private readonly ALEX_ID_TO_BINANCE: Record<string, string> = {
        'age000-governance-token': 'ALEXUSDT',
        'token-wbtc': 'BTCUSDT',
    };

    // ALEX SDK ID → CoinGecko ID
    private readonly ALEX_ID_TO_CG: Record<string, string> = {
        'age000-governance-token': 'alexgo',
        'token-wbtc': 'bitcoin',
        'token-susdt': 'tether',
        'token-aeusdc': 'usd-coin',
    };

    constructor() {
        this.alex = new AlexSDK();
    }

    public async getTokenMetadata(token: string): Promise<{ symbol: string, decimals: number }> {
        const normalized = token.includes('.') ? token.split('.').pop()!.toLowerCase() : token.toLowerCase();

        if (this.KNOWN_DECIMALS[normalized]) return { symbol: normalized.toUpperCase(), decimals: this.KNOWN_DECIMALS[normalized] };
        if (this.metadataCache.has(token)) return this.metadataCache.get(token)!;

        try {
            const allTokens = await this.alex.fetchSwappableCurrency();
            const match = allTokens.find((t: any) => {
                const contractAddr = t.wrapToken ? t.wrapToken.split('::')[0] : t.id;
                return contractAddr?.toLowerCase() === token.toLowerCase() || t.id?.toLowerCase() === token.toLowerCase();
            });
            if (match) {
                const meta = {
                    symbol: match.name || match.id || 'TOKEN',
                    decimals: match.wrapTokenDecimals ?? match.underlyingTokenDecimals ?? 8
                };
                this.metadataCache.set(token, meta);
                return meta;
            }
        } catch {}

        if (token.includes('.')) {
            try {
                const [addr, name] = token.split('.');
                const res = await fetch(`https://api.hiro.so/metadata/v1/ft/${addr}.${name}`, { signal: AbortSignal.timeout(3000) });
                if (res.ok) {
                    const data = await res.json();
                    if (data.decimals !== undefined) {
                        const meta = { symbol: data.symbol || 'TOKEN', decimals: data.decimals };
                        this.metadataCache.set(token, meta);
                        return meta;
                    }
                }
            } catch {}
        }

        return { symbol: normalized.toUpperCase(), decimals: 6 };
    }

    // ── STX Price ─────────────────────────────────────────────────────────────
    // Order: ALEX SDK (aUSD/wSTX on-chain) → Binance → CoinCap → CoinGecko

    public async getStxPrice(): Promise<number | null> {
        const cacheKey = 'stx-usd';
        const cached = await this.cache.get(cacheKey);
        if (cached !== null) return cached;

        const sources: PriceSource[] = [
            {
                // Price 1 aUSD (~$1) against wSTX on ALEX DEX, then invert.
                // aUSD is the stablecoin available on ALEX DEX (8 decimals).
                // Fully on-chain — no API keys, no rate limits.
                name: 'ALEX SDK (aUSD/wSTX)',
                getPrice: async () => {
                    try {
                        const amountOut = await this.alex.getAmountTo(
                            'token-ausd' as any,
                            BigInt(1e8), // 1 aUSD (8 decimals)
                            'token-wstx' as any
                        );
                        if (!amountOut || Number(amountOut) <= 0) return null;
                        // amountOut = micro-wSTX (8 decimals on ALEX)
                        // 1 aUSD ≈ $1 → STX per $1 = amountOut/1e8 → $/STX = 1/(amountOut/1e8)
                        const stxPerUsd = Number(amountOut) / 1e8;
                        return stxPerUsd > 0 ? 1 / stxPerUsd : null;
                    } catch { return null; }
                }
            },
            {
                name: 'Binance',
                getPrice: async () => {
                    try {
                        const res = await fetch(
                            'https://api.binance.com/api/v3/ticker/price?symbol=STXUSDT',
                            { signal: AbortSignal.timeout(5000) }
                        );
                        if (res.ok) {
                            const data = await res.json();
                            return parseFloat(data.price) || null;
                        }
                        return null;
                    } catch { return null; }
                }
            },
            {
                name: 'CoinCap',
                getPrice: async () => {
                    try {
                        const res = await fetch('https://api.coincap.io/v2/assets/blockstack', { signal: AbortSignal.timeout(8000) });
                        if (res.ok) {
                            const data = await res.json();
                            return parseFloat(data.data?.priceUsd) || null;
                        }
                        return null;
                    } catch { return null; }
                }
            },
            {
                name: 'CoinGecko',
                getPrice: async () => {
                    try {
                        const res = await fetch(
                            'https://api.coingecko.com/api/v3/simple/price?ids=blockstack&vs_currencies=usd',
                            { signal: AbortSignal.timeout(5000) }
                        );
                        if (res.ok) {
                            const data = await res.json();
                            return data.blockstack?.usd || null;
                        }
                        return null;
                    } catch { return null; }
                }
            },
        ];

        for (const source of sources) {
            try {
                const price = await source.getPrice();
                if (price && price > 0) {
                    console.log(`[Oracle] STX price from ${source.name}: $${price}`);
                    await this.cache.set(cacheKey, price);
                    return price;
                }
            } catch {}
        }

        console.error('[Oracle] ALL STX price sources failed.');
        return null;
    }

    // ── Token USD Price ───────────────────────────────────────────────────────
    // Order: ALEX SDK → Binance → CoinGecko → aUSD stablecoin fallback

    public async getTokenUsdPrice(token: string, tokenDecimals: number = 6): Promise<number | null> {
        const cacheKey = `token-usd-${token}`;
        const cached = await this.cache.get(cacheKey);
        if (cached !== null) return cached;

        // STX/wSTX
        if (token === 'STX' || token.toLowerCase().includes('wstx')) {
            return this.getStxPrice();
        }

        // Stablecoins — always $1, cache and return immediately
        const normalizedToken = token.includes('.') ? token.split('.').pop()!.toLowerCase() : token.toLowerCase();
        if (this.STABLECOINS.has(token) || this.STABLECOINS.has(normalizedToken)) {
            await this.cache.set(cacheKey, 1.0);
            return 1.0;
        }

        // Resolve full principal → ALEX SDK ID
        const alexId = this.PRINCIPAL_TO_ALEX_ID[token] || normalizedToken;

        const sources: TokenUsdSource[] = [
            {
                name: 'ALEX SDK (via wSTX)',
                getUsdPrice: async (id: string) => {
                    try {
                        const unitInMicro = BigInt(10 ** tokenDecimals);
                        const amountOut = await this.alex.getAmountTo(id as any, unitInMicro, 'token-wstx' as any);
                        if (!amountOut || Number(amountOut) <= 0) return null;
                        const stxPerToken = Number(amountOut) / 1e8;
                        const stxUsd = await this.getStxPrice();
                        if (!stxUsd) return null;
                        const usdPrice = stxPerToken * stxUsd;
                        console.log(`[Oracle] ${id} via ALEX/wSTX: ${stxPerToken} STX = $${usdPrice.toFixed(6)}`);
                        return usdPrice > 0 ? usdPrice : null;
                    } catch (e) {
                        console.warn(`[Oracle] ALEX SDK (wSTX) failed for ${id}:`, (e as Error).message);
                        return null;
                    }
                }
            },
            {
                name: 'Binance',
                getUsdPrice: async (id: string) => {
                    const pair = this.ALEX_ID_TO_BINANCE[id];
                    if (!pair) return null;
                    try {
                        const res = await fetch(
                            `https://api.binance.com/api/v3/ticker/price?symbol=${pair}`,
                            { signal: AbortSignal.timeout(5000) }
                        );
                        if (res.ok) {
                            const data = await res.json();
                            const price = parseFloat(data.price);
                            if (price > 0) {
                                console.log(`[Oracle] ${id} via Binance: $${price}`);
                                return price;
                            }
                        }
                        return null;
                    } catch { return null; }
                }
            },
            {
                name: 'CoinGecko',
                getUsdPrice: async (id: string) => {
                    const cgId = this.ALEX_ID_TO_CG[id];
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
                                console.log(`[Oracle] ${id} via CoinGecko: $${usdPrice}`);
                                return usdPrice;
                            }
                        }
                        return null;
                    } catch { return null; }
                }
            }
        ];

        for (const source of sources) {
            try {
                const usdPrice = await source.getUsdPrice(alexId);
                if (usdPrice && usdPrice > 0) {
                    await this.cache.set(cacheKey, usdPrice);
                    return usdPrice;
                }
            } catch {}
        }

        // Last resort: price token directly against aUSD on ALEX DEX.
        // aUSD is the stablecoin on ALEX DEX (8 decimals), pegged to $1.
        // This requires no external API — purely on-chain.
        try {
            const amountOut = await this.alex.getAmountTo(
                alexId as any,
                BigInt(10 ** tokenDecimals),
                'token-ausd' as any
            );
            if (amountOut && Number(amountOut) > 0) {
                // amountOut is micro-aUSD (8 decimals) → divide by 1e8 to get USD
                const usdPrice = Number(amountOut) / 1e8;
                console.log(`[Oracle] ${alexId} via ALEX/aUSD stablecoin fallback: $${usdPrice.toFixed(6)}`);
                await this.cache.set(cacheKey, usdPrice);
                return usdPrice;
            }
        } catch (e) {
            console.warn(`[Oracle] aUSD stablecoin fallback failed for ${alexId}:`, (e as Error).message);
        }

        console.error(`[Oracle] All sources failed for ${token} (alexId=${alexId})`);
        return null;
    }

    // Legacy: returns STX per token
    public async getTokenRate(token: string, tokenDecimals: number = 6): Promise<number | null> {
        const usdPrice = await this.getTokenUsdPrice(token, tokenDecimals);
        const stxUsd = await this.getStxPrice();
        if (usdPrice === null || stxUsd === null || stxUsd === 0) return null;
        return usdPrice / stxUsd;
    }

    // Convert raw micro-amount to USD
    public async convertToUsdcx(amount: string | bigint, token: string, tokenDecimals?: number): Promise<number | null> {
        const rawAmount = BigInt(amount);
        if (rawAmount === BigInt(0)) return 0;

        let decimals = tokenDecimals;
        if (decimals === undefined) {
            const meta = await this.getTokenMetadata(token);
            decimals = meta.decimals;
        }

        const usdPerToken = await this.getTokenUsdPrice(token, decimals);
        if (usdPerToken === null) return null;

        return (Number(rawAmount) / Math.pow(10, decimals)) * usdPerToken;
    }

    public async clearCache(key?: string): Promise<void> {
        await this.cache.del(key);
    }

    public getCacheStats() {
        return this.cache.stats();
    }
}
