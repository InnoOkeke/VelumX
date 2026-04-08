import { AlexSDK } from 'alex-sdk';

interface PriceSource {
    name: string;
    getPrice: () => Promise<number | null>;
}

interface TokenUsdSource {
    name: string;
    getUsdPrice: (token: string) => Promise<number | null>;
}

/**
 * Pricing Oracle Service
 * All public methods return USD values directly — no STX bridge conversion.
 */
export class PricingOracleService {
    private alex: AlexSDK;
    private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
    private readonly CACHE_TTL = 30000; // 30 seconds
    private metadataCache: Map<string, { symbol: string, decimals: number }> = new Map();
    private readonly KNOWN_DECIMALS: Record<string, number> = {
        'token-alex': 8, 'age000-governance-token': 8,
        'sbtc-token': 8, 'token-wbtc': 8, 
        'usdcx': 6, 'token-aeusdc': 6, 'aeusdc': 6,
        'token-wstx': 6, 'stx': 6, 'token-susdt': 8
    };

    constructor() {
        this.alex = new AlexSDK();
    }

    /**
     * Resolves token metadata (symbol and decimals) reliably.
     * Order: Hardcoded -> ALEX SDK -> Hiro API -> Fallback 6.
     */
    public async getTokenMetadata(token: string): Promise<{ symbol: string, decimals: number }> {
        const normalized = token.includes('.') ? token.split('.').pop()!.toLowerCase() : token.toLowerCase();
        
        // 1. Check Hardcoded & Cache
        if (this.KNOWN_DECIMALS[normalized]) return { symbol: normalized.toUpperCase(), decimals: this.KNOWN_DECIMALS[normalized] };
        if (this.metadataCache.has(token)) return this.metadataCache.get(token)!;

        // 2. Try ALEX SDK
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
        } catch (e) {}

        // 3. Try Hiro API
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
            } catch (e) {}
        }

        return { symbol: normalized.toUpperCase(), decimals: 6 };
    }

    // ─── STX Price ────────────────────────────────────────────────────────────

    public async getStxPrice(): Promise<number | null> {
        const cacheKey = 'stx-usd';
        const cached = this.priceCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) return cached.price;

        const sources: PriceSource[] = [
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
                        const res = await fetch('https://api.coincap.io/v2/assets/blockstack', { signal: AbortSignal.timeout(10000) });
                        if (res.ok) {
                            const data = await res.json();
                            return parseFloat(data.data.priceUsd) || null;
                        }
                        return null;
                    } catch { return null; }
                }
            }
        ];

        for (const source of sources) {
            const price = await source.getPrice();
            if (price && price > 0) {
                console.log(`[Oracle] STX price from ${source.name}: $${price}`);
                this.priceCache.set(cacheKey, { price, timestamp: Date.now() });
                return price;
            }
        }
        
        console.error('[Oracle] ALL price sources failed. No fallback available.');
        return null; // Explicit failure
    }

    // ─── Token USD Price ──────────────────────────────────────────────────────

    /**
     * Returns the USD price of 1 full token.
     * Stablecoins always return $1.00.
     * Other tokens use ALEX SDK DEX price converted to USD via STX price.
     */
    public async getTokenUsdPrice(token: string, tokenDecimals: number = 6): Promise<number | null> {
        const cacheKey = `token-usd-${token}-${tokenDecimals}`;
        const cached = this.priceCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) return cached.price;

        // STX/wSTX — return live STX price
        if (token === 'STX' || token.includes('wstx')) {
            const price = await this.getStxPrice();
            if (price === null) return null;
            return price;
        }

        // Map full principals to ALEX SDK token IDs
        const PRINCIPAL_TO_ALEX_ID: Record<string, string> = {
            'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex': 'age000-governance-token',
            'SP3Y2ZSH8P7D50B0JLZVGKMBC7PX3RVRGWJKWKY38.token-aeusdc': 'token-aeusdc',
            'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token': 'token-wbtc',
            'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx': 'token-susdt',
        };
        const alexId = PRINCIPAL_TO_ALEX_ID[token] || token;

        const sources: TokenUsdSource[] = [
            {
                name: 'ALEX SDK',
                getUsdPrice: async (id: string) => {
                    try {
                        // Ask: how many micro-wSTX for 1 full token?
                        const unitInMicro = BigInt(10 ** tokenDecimals);
                        const amountOut = await this.alex.getAmountTo(id as any, unitInMicro, 'token-wstx' as any);
                        if (!amountOut) return null;
                        // amountOut is in micro-wSTX (8 decimals on ALEX)
                        const stxPerToken = Number(amountOut) / 100_000_000;
                        const stxUsd = await this.getStxPrice();
                        if (stxUsd === null) return null;
                        
                        const usdPrice = stxPerToken * stxUsd;
                        console.log(`[Oracle] ${id} via ALEX SDK: ${stxPerToken} STX = $${usdPrice}`);
                        return usdPrice > 0 ? usdPrice : null;
                    } catch (e) {
                        console.warn(`[Oracle] ALEX SDK failed for ${id}:`, e);
                        return null;
                    }
                }
            },
            {
                name: 'CoinGecko',
                getUsdPrice: async (id: string) => {
                    const CG_IDS: Record<string, string> = {
                        'age000-governance-token': 'alexgo',
                        'token-wbtc': 'bitcoin',
                        'token-susdt': 'tether',
                        'token-aeusdc': 'usd-coin',
                    };
                    const cgId = CG_IDS[id];
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
                    } catch (e) {
                        console.warn(`[Oracle] CoinGecko failed for ${id}:`, e);
                    }
                    return null;
                }
            }
        ];

        for (const source of sources) {
            const usdPrice = await source.getUsdPrice(alexId);
            if (usdPrice && usdPrice > 0) {
                this.priceCache.set(cacheKey, { price: usdPrice, timestamp: Date.now() });
                return usdPrice;
            }
        }

        // Last resort: use STX price (1:1 assumption)
        console.error(`[Oracle] All sources failed for ${token}, falling back to STX price`);
        const stxFallback = await this.getStxPrice();
        return stxFallback;
    }

    // ─── Legacy compatibility (returns STX per token) ─────────────────────────

    public async getTokenRate(token: string, tokenDecimals: number = 6): Promise<number | null> {
        const usdPrice = await this.getTokenUsdPrice(token, tokenDecimals);
        const stxUsd = await this.getStxPrice();
        if (usdPrice === null || stxUsd === null || stxUsd === 0) return null;
        return usdPrice / stxUsd; // STX per token
    }

    // ─── Convert token amount to USD ──────────────────────────────────────────

    /**
     * Converts a raw micro-amount of a token to its USD (USDCx) equivalent.
     */
    public async convertToUsdcx(amount: string | bigint, token: string, tokenDecimals?: number): Promise<number | null> {
        const rawAmount = BigInt(amount);
        if (rawAmount === BigInt(0)) return 0;

        // Auto-resolve decimals if not provided
        let decimals = tokenDecimals;
        if (decimals === undefined) {
            const meta = await this.getTokenMetadata(token);
            decimals = meta.decimals;
        }

        const usdPerToken = await this.getTokenUsdPrice(token, decimals);
        if (usdPerToken === null) return null;
        
        const tokenAmount = Number(rawAmount) / Math.pow(10, decimals);
        return tokenAmount * usdPerToken;
    }

    public clearCache(key?: string) {
        if (key) this.priceCache.delete(key);
        else this.priceCache.clear();
    }

    public getCacheStats() {
        return {
            size: this.priceCache.size,
            entries: Array.from(this.priceCache.entries()).map(([key, value]) => ({
                key, price: value.price, age: Date.now() - value.timestamp
            }))
        };
    }
}
