import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PaymasterService } from './PaymasterService.js';
import { getAddressFromPrivateKey } from '@stacks/transactions';
import { STACKS_MAINNET, STACKS_TESTNET } from '@stacks/network';
import { verifySupabaseToken, AuthRequest } from './auth.js';
import { createRateLimiters } from './middleware/rateLimiter.js';
import { StatusSyncService } from './StatusSyncService.js';
import { getCachedStats, setCachedStats, invalidateStatsCache } from './services/RedisClient.js';

dotenv.config();

const prisma = new PrismaClient();
const statusSync = new StatusSyncService();
statusSync.start();

const rateLimiters = createRateLimiters();
const app = express();
const port = process.env.PORT || 4000;

(BigInt.prototype as any).toJSON = function () { return this.toString(); };

app.use(cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        const allowedPatterns = [/localhost:\d+$/, /\.vercel\.app$/, /velumx\.xyz$/, /\.velumx\.xyz$/];
        if (!origin || allowedPatterns.some(p => p.test(origin))) {
            callback(null, true);
        } else {
            console.warn(`CORS: Blocked request from unauthorized origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}));
app.use(express.json());

const paymasterService = new PaymasterService();

app.get('/', (_req: express.Request, res: express.Response) => {
    res.send('<h1>VelumX Relayer is Live</h1><p>Visit <a href="/health">/health</a> for status.</p>');
});

app.get('/health', (_req: express.Request, res: express.Response) => {
    res.json({ status: 'ok', service: 'VelumX Relayer', pricingOracle: 'active' });
});

interface ApiKeyRequest extends express.Request {
    apiKeyId?: string;
    userId?: string;
}

const validateApiKey = async (req: ApiKeyRequest, res: express.Response, next: express.NextFunction) => {
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey) {
        return res.status(401).json({ error: "Unauthorized: Missing x-api-key header" });
    }
    try {
        const keyRecord = await (prisma.apiKey as any).findUnique({
            where: { key: apiKey },
            select: { id: true, userId: true, status: true }
        });
        if (!keyRecord) return res.status(401).json({ error: "Unauthorized: Invalid API key" });
        if (keyRecord.status !== 'Active') return res.status(403).json({ error: "Forbidden: API key is disabled or revoked" });
        req.apiKeyId = keyRecord.id;
        req.userId = keyRecord.userId || undefined;
        next();
    } catch (error) {
        console.error("Auth Middleware Error:", error);
        res.status(500).json({ error: "Security check failed" });
    }
};

app.get('/api/v1/config', validateApiKey, async (req: ApiKeyRequest, res: express.Response) => {
    try {
        const apiKey = await (prisma.apiKey as any).findUnique({
            where: { id: req.apiKeyId },
            select: { supportedGasTokens: true, sponsorshipPolicy: true }
        });
        res.json({
            supportedGasTokens: apiKey?.supportedGasTokens || [],
            sponsorshipPolicy: apiKey?.sponsorshipPolicy || 'USER_PAYS'
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/v1/estimate', validateApiKey, rateLimiters.estimate.middleware(), async (req: ApiKeyRequest, res: express.Response) => {
    try {
        const { intent, network } = req.body;
        if (!intent) return res.status(400).json({ error: "Missing intent" });
        const estimationIntent = { ...intent, network: network || intent.network || 'mainnet' };
        const estimation = await paymasterService.estimateFee(estimationIntent, req.apiKeyId!);
        const targetNetwork = estimationIntent.network as 'mainnet' | 'testnet';
        const relayerKey = paymasterService.getUserRelayerKey(req.userId!);
        const relayerAddress = getAddressFromPrivateKey(relayerKey.replace(/^0x/, ''), targetNetwork);
        const paymasterAddress = paymasterService.getPaymasterAddress(targetNetwork);
        res.json({ ...estimation, relayerAddress, paymasterAddress });
    } catch (error: any) {
        console.error("Estimation Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/v1/sponsor', validateApiKey, rateLimiters.sponsor.middleware(), async (req: ApiKeyRequest, res: express.Response) => {
    try {
        const { intent } = req.body;
        if (!intent || !intent.signature) return res.status(400).json({ error: "Missing signed intent" });
        const result = await paymasterService.sponsorIntent(intent, req.apiKeyId, req.userId);
        if (req.userId) await invalidateStatsCache(req.userId);
        res.json(result);
    } catch (error: any) {
        console.error("Sponsorship Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/v1/broadcast', validateApiKey, rateLimiters.broadcast.middleware(), async (req: ApiKeyRequest, res: express.Response) => {
    try {
        const { txHex, userId, feeAmount } = req.body;
        if (!txHex) return res.status(400).json({ error: "Missing transaction hex" });
        const result = await paymasterService.sponsorRawTransaction(txHex, req.apiKeyId!, userId || req.userId!, feeAmount);
        if (req.userId) await invalidateStatsCache(req.userId);
        res.json(result);
    } catch (error: any) {
        console.error("Broadcast Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/dashboard/export-key', verifySupabaseToken, async (req: AuthRequest, res: express.Response) => {
    try {
        const userId = req.userId!;
        const key = paymasterService.getUserRelayerKey(userId);
        const { getAddressFromPrivateKey: getAddr } = await import('@stacks/transactions');
        res.json({
            mainnetAddress: getAddr(key, 'mainnet'),
            testnetAddress: getAddr(key, 'testnet'),
            key
        });
    } catch (error: any) {
        console.error("Export Key Error:", error);
        res.status(500).json({ error: "Failed to export key" });
    }
});

// ── Dashboard Stats ───────────────────────────────────────────────────────────

// Cache bust endpoint — clears stale dashboard cache for the authenticated user
app.post('/api/dashboard/cache-clear', verifySupabaseToken, async (req: AuthRequest, res: express.Response) => {
    try {
        await invalidateStatsCache(req.userId!);
        res.json({ ok: true });
    } catch (e) {
        res.json({ ok: true }); // always succeed
    }
});

app.get('/api/dashboard/stats', verifySupabaseToken, rateLimiters.dashboard.middleware(), async (req: AuthRequest, res: express.Response) => {
    try {
        const userId = req.userId!;

        // Serve from Redis cache if available (2 min TTL)
        const cached = await getCachedStats(userId);
        if (cached) {
            console.log(`[Dashboard] Serving cached stats for ${userId}`);
            res.json(cached);
            return;
        }

        const getNetworkStats = async (networkType: 'mainnet' | 'testnet') => {
            try {
                const relayerKey = paymasterService.getUserRelayerKey(userId);
                const networkObj = networkType === 'mainnet' ? STACKS_MAINNET : STACKS_TESTNET;
                const relayerAddress = getAddressFromPrivateKey(relayerKey.replace(/^0x/, ''), networkObj);
                const hiroApiBase = networkType === 'mainnet' ? 'https://api.hiro.so' : 'https://api.testnet.hiro.so';

                // Run all independent operations in parallel
                const [totalTransactions, successfulTxs, allBroadcastedTxs, stxPrice, balancesData] = await Promise.all([
                    (prisma.transaction as any).count({ where: { userId, network: networkType } }),
                    (prisma.transaction as any).findMany({ where: { userId, network: networkType, status: { in: ['Success', 'Confirmed'] } } }),
                    (prisma.transaction as any).count({ where: { userId, network: networkType, status: { notIn: ['Failed'] } } }),
                    paymasterService.getStxPrice(),
                    fetch(`${hiroApiBase}/extended/v1/address/${relayerAddress}/balances`)
                        .then(r => r.ok ? r.json() : null)
                        .catch(() => null)
                ]);

                const totalSponsoredUsd = (stxPrice || 0) * (allBroadcastedTxs * 0.005);
                const relayerStxBalance: string = balancesData?.stx?.balance || "0";

                // Wallet FT audit — convert all token balances to USD in parallel
                let walletFeeValueUsd = 0;
                if (balancesData?.fungible_tokens) {
                    const ftEntries = Object.entries(balancesData.fungible_tokens)
                        .filter(([, info]) => (info as any).balance && (info as any).balance !== '0')
                        .map(([rawKey, info]) => ({
                            principal: rawKey.includes('::') ? rawKey.split('::')[0] : rawKey,
                            balance: (info as any).balance as string
                        }));

                    const usdValues = await Promise.all(
                        ftEntries.map(({ principal, balance }) =>
                            paymasterService.convertToUsdcx(balance, principal).catch(() => null)
                        )
                    );

                    usdValues.forEach((val, i) => {
                        if (val && val > 0) {
                            console.log(`[Stats-Audit] ${ftEntries[i].principal}: balance=${ftEntries[i].balance}, USD=${val}`);
                            walletFeeValueUsd += val;
                        }
                    });
                }

                // Log-based revenue — convert all confirmed tx fees to USD in parallel
                const validTxs = successfulTxs.filter((tx: any) =>
                    tx.feeAmount && tx.feeAmount !== '0' &&
                    tx.feeToken && tx.feeToken !== 'unknown' && tx.feeToken !== 'Token'
                );
                const feeUsdValues = await Promise.all(
                    validTxs.map((tx: any) =>
                        paymasterService.convertToUsdcx(tx.feeAmount, tx.feeToken).catch(() => null)
                    )
                );
                const totalFeeValueUsd = (feeUsdValues as (number | null)[])
                    .reduce((acc: number, val) => acc + (val || 0), 0);

                return {
                    totalTransactions,
                    totalSponsored: totalSponsoredUsd.toFixed(6),
                    relayerAddress,
                    relayerStxBalance,
                    relayerFeeBalance: walletFeeValueUsd.toFixed(2),
                    revenueMainnet: totalFeeValueUsd.toFixed(2),
                    feeToken: 'USD'
                };
            } catch (err) {
                console.error(`Stats Error for ${networkType}:`, err);
                return { totalTransactions: 0, totalSponsored: "0", relayerAddress: "Error", relayerStxBalance: "0", relayerFeeBalance: "0", feeToken: "Tokens" };
            }
        };

        // Run mainnet and testnet stats in parallel too
        const [mainnet, testnet, activeKeysCount] = await Promise.all([
            getNetworkStats('mainnet'),
            getNetworkStats('testnet'),
            (prisma.apiKey as any).count({ where: { userId, status: 'Active' } })
        ]);

        const response = { activeKeys: activeKeysCount, networks: { mainnet, testnet } };
        // Only cache if we got real data — don't cache a cold-start zero response
        const hasRealData = parseFloat(mainnet.totalSponsored) > 0 || parseFloat(mainnet.relayerFeeBalance) > 0 || mainnet.totalTransactions > 0;
        if (hasRealData) await setCachedStats(userId, response);
        res.json(response);
        return;
    } catch (error: any) {
        console.error("Dashboard Stats Critical Error:", error);
        res.status(500).json({ error: "Internal Server Error during stats generation" });
    }
});

app.get('/api/dashboard/keys', verifySupabaseToken, rateLimiters.dashboard.middleware(), async (req: AuthRequest, res: express.Response) => {
    try {
        const userId = req.userId!;
        const keys = await (prisma.apiKey as any).findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
        res.json(keys);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/dashboard/keys', verifySupabaseToken, rateLimiters.dashboard.middleware(), async (req: AuthRequest, res: express.Response) => {
    try {
        const userId = req.userId!;
        const { name } = req.body;
        const rawKey = `sgal_live_${Math.random().toString(36).substring(2, 15)}`;
        const newKey = await (prisma.apiKey as any).create({
            data: { name: name || 'Unnamed Key', key: rawKey, status: 'Active', userId }
        });
        res.json(newKey);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/dashboard/logs', verifySupabaseToken, rateLimiters.dashboard.middleware(), async (req: AuthRequest, res: express.Response) => {
    try {
        const userId = req.userId!;
        const { network } = req.query;
        const where: any = { userId };
        if (network === 'mainnet' || network === 'testnet') where.network = network;
        const logs = await (prisma.transaction as any).findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: { apiKey: true }
        });
        res.json(logs);
    } catch (error: any) {
        console.error("Dashboard Logs Error:", error);
        res.json([]);
    }
});

app.listen(port, () => {
    console.log(`VelumX Relayer running on port ${port}`);
});
