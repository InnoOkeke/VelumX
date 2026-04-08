import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PaymasterService } from './PaymasterService.js';
import { getAddressFromPrivateKey } from '@stacks/transactions';
import { STACKS_MAINNET, STACKS_TESTNET } from '@stacks/network';

import { verifySupabaseToken, AuthRequest } from './auth.js';
import { createRateLimiters } from './middleware/rateLimiter.js';

import { StatusSyncService } from './StatusSyncService.js';

dotenv.config();

const prisma = new PrismaClient();
const statusSync = new StatusSyncService();
statusSync.start();

// Initialize rate limiters
const rateLimiters = createRateLimiters();

const app = express();
const port = process.env.PORT || 4000;

// Fix for JSON.stringify with BigInt
(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

interface SignedIntent {
    target: string;
    payload: string;
    maxFee: string | number;
    maxFeeUSDCx?: string | number; // Legacy support
    feeToken: string;
    nonce: string | number;
    signature: string;
    network?: 'mainnet' | 'testnet';
}

app.use(cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        // Allow all origins in development (no origin) or specific trusted domains
        const allowedPatterns = [
            /localhost:\d+$/,
            /\.vercel\.app$/,
            /velumx\.xyz$/,
            /\.velumx\.xyz$/
        ];

        if (!origin || allowedPatterns.some(pattern => pattern.test(origin))) {
            callback(null, true);
        } else {
            // Reject unauthorized origins in production
            console.warn(`CORS: Blocked request from unauthorized origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}));
app.use(express.json());

const paymasterService = new PaymasterService();

// Root Route
app.get('/', (req: express.Request, res: express.Response) => {
    res.send('<h1>VelumX Relayer is Live</h1><p>Visit <a href="/health">/health</a> for status.</p>');
});

// Health Check
app.get('/health', (req: express.Request, res: express.Response) => {
    res.json({ 
        status: 'ok', 
        service: 'VelumX Relayer',
        rateLimiters: {
            estimate: 'active',
            sponsor: 'active',
            broadcast: 'active',
            dashboard: 'active'
        },
        pricingOracle: 'active'
    });
});

// Authentication Middleware for SDK Integration
interface ApiKeyRequest extends express.Request {
    apiKeyId?: string;
    userId?: string;
}

const validateApiKey = async (req: ApiKeyRequest, res: express.Response, next: express.NextFunction) => {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
        return res.status(401).json({ 
            error: "Unauthorized: Missing x-api-key header", 
            message: "This SDK feature is gated. Please get your API key from the VelumX Developer Dashboard." 
        });
    }

    try {
        const keyRecord = await (prisma.apiKey as any).findUnique({
            where: { key: apiKey },
            select: { id: true, userId: true, status: true }
        });

        if (!keyRecord) {
            return res.status(401).json({ error: "Unauthorized: Invalid API key" });
        }

        if (keyRecord.status !== 'Active') {
            return res.status(403).json({ error: "Forbidden: API key is disabled or revoked" });
        }

        req.apiKeyId = keyRecord.id;
        req.userId = keyRecord.userId || undefined;
        next();
    } catch (error) {
        console.error("Auth Middleware Error:", error);
        res.status(500).json({ error: "Security check failed" });
    }
};

// Public config endpoint — returns developer's allowed gas tokens for the given API key
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

// Estimate Fee
app.post('/api/v1/estimate', validateApiKey, rateLimiters.estimate.middleware(), async (req: ApiKeyRequest, res: express.Response) => {
    try {
        const { intent, network } = req.body;
        
        if (!intent) {
            return res.status(400).json({ error: "Missing intent" });
        }

        // Network context for Universal gas estimation
        const estimationIntent = { ...intent, network: network || intent.network || 'mainnet' };

        const estimation = await paymasterService.estimateFee(estimationIntent, req.apiKeyId!);

        // Include the developer's relayer address and paymaster contract
        // so frontend can build paymaster txs without any env config
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

// Sponsor and Submit Intent Endpoint
app.post('/api/v1/sponsor', validateApiKey, rateLimiters.sponsor.middleware(), async (req: ApiKeyRequest, res: express.Response) => {
    try {
        const { intent } = req.body;

        if (!intent || !intent.signature) {
            return res.status(400).json({ error: "Missing signed intent" });
        }

        const result = await paymasterService.sponsorIntent(intent, req.apiKeyId, req.userId);
        res.json(result);
    } catch (error: any) {
        console.error("Sponsorship Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Broadcast Raw Transaction (Gated Native Sponsorship)
app.post('/api/v1/broadcast', validateApiKey, rateLimiters.broadcast.middleware(), async (req: ApiKeyRequest, res: express.Response) => {
    try {
        const { txHex, userId, feeAmount } = req.body;
        
        if (!txHex) {
            return res.status(400).json({ error: "Missing transaction hex" });
        }

        const result = await paymasterService.sponsorRawTransaction(txHex, req.apiKeyId!, userId || req.userId!, feeAmount);
        res.json(result);
    } catch (error: any) {
        console.error("Broadcast Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Export Relayer Private Key (Authenticated Developer only)
app.get('/api/dashboard/export-key', verifySupabaseToken, async (req: AuthRequest, res: express.Response) => {
    try {
        const userId = req.userId!;
        const key = paymasterService.getUserRelayerKey(userId);
        
        // Return both the address and the key
        const { getAddressFromPrivateKey } = await import('@stacks/transactions');
        const networkType = (process.env.NETWORK || 'mainnet') as "mainnet" | "testnet";
        const mainnetAddress = getAddressFromPrivateKey(key, 'mainnet');
        const testnetAddress = getAddressFromPrivateKey(key, 'testnet');

        res.json({ mainnetAddress, testnetAddress, key });
    } catch (error: any) {
        console.error("Export Key Error:", error);
        res.status(500).json({ error: "Failed to export key" });
    }
});

// ==========================================
// Dashboard Analytics Endpoints (Multi-tenant)
// ==========================================

// Get Analytics Overview
app.get('/api/dashboard/stats', verifySupabaseToken, rateLimiters.dashboard.middleware(), async (req: AuthRequest, res: express.Response) => {
    try {
        const userId = req.userId!;

        const getNetworkStats = async (networkType: 'mainnet' | 'testnet') => {
            try {
                // 1. Fetch Transactions with Tokens
                const transactions = await (prisma.transaction as any).findMany({
                    where: { userId, network: networkType },
                    select: { feeAmount: true, feeToken: true }
                });

                const totalTransactions = transactions.length;

                // 2. Batch Convert Fees to USDCx
                // Standardize on 6-decimal USDCx units
                let totalRevenueUsdcx = 0;
                
                // Optimized pricing: cache token rates for this batch
                const tokenRates: Record<string, number> = {};
                const stxPrice = await paymasterService.getStxPrice();

                for (const tx of transactions) {
                    const token = tx.feeToken || 'Token';
                    if (!tokenRates[token]) {
                        tokenRates[token] = await paymasterService.getTokenRate(token);
                    }
                    
                    const amountInToken = Number(tx.feeAmount || '0') / 1_000_000;
                    const amountInUsdcx = (amountInToken * tokenRates[token]) * stxPrice;
                    totalRevenueUsdcx += amountInUsdcx;
                }

                // 3. Metadata for Dashboard
                const feeTokenSymbol = 'USDCx'; 
                const totalSponsored = totalRevenueUsdcx.toFixed(2); // String format for UI consistency

                // 3. On-Chain Metrics
                const relayerKey = paymasterService.getUserRelayerKey(userId);
                const relayerAddress = getAddressFromPrivateKey(relayerKey.replace(/^0x/, ''), networkType as any);

                let relayerStxBalance = "0";
                let relayerFeeBalance = "0";

                try {
                    const stxNetwork = networkType === 'mainnet' ? 'mainnet' : 'testnet';
                    const balancesRes = await fetch(`https://api.${stxNetwork}.hiro.so/extended/v1/address/${relayerAddress}/balances`);
                    
                    if (balancesRes.ok) {
                        const balances = await balancesRes.json();
                        relayerStxBalance = balances.stx.balance;
                        
                        // Calculate total USDCx value of all fungible tokens
                        let totalFeeValueUsdcx = 0;
                        const ftBalances = balances.fungible_tokens || {};
                        
                        for (const tokenKey of Object.keys(ftBalances)) {
                            const tokenPrincipal = tokenKey.split('::')[0];
                            const balance = ftBalances[tokenKey].balance;
                            
                            if (balance !== '0') {
                                const usdcxEquivalent = await paymasterService.convertToUsdcx(balance, tokenPrincipal);
                                totalFeeValueUsdcx += usdcxEquivalent;
                            }
                        }
                        
                        relayerFeeBalance = totalFeeValueUsdcx.toFixed(2);
                    }
                } catch (e) { console.warn("Balance check failed", e); }

                return {
                    totalTransactions,
                    totalSponsored: totalSponsored.toString(),
                    relayerAddress,
                    relayerStxBalance,
                    relayerFeeBalance,
                    feeToken: feeTokenSymbol
                };
            } catch (err) {
                console.error(`Stats Error for ${networkType}:`, err);
                return { totalTransactions: 0, totalSponsored: "0", relayerAddress: "Error", relayerStxBalance: "0", relayerFeeBalance: "0", feeToken: "Tokens" };
            }
        };

        const mainnet = await getNetworkStats('mainnet');
        const testnet = await getNetworkStats('testnet');
        const activeKeysCount = await (prisma.apiKey as any).count({ where: { userId, status: 'Active' } });

        res.json({
            activeKeys: activeKeysCount,
            networks: { mainnet, testnet }
        });
    } catch (error: any) {
        console.error("Dashboard Stats Critical Error:", error);
        res.status(500).json({ error: "Internal Server Error during stats generation" });
    }
});

// Get API Keys
app.get('/api/dashboard/keys', verifySupabaseToken, rateLimiters.dashboard.middleware(), async (req: AuthRequest, res: express.Response) => {
    try {
        const userId = req.userId!;
        const keys = await (prisma.apiKey as any).findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(keys);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Generate new API Key
app.post('/api/dashboard/keys', verifySupabaseToken, rateLimiters.dashboard.middleware(), async (req: AuthRequest, res: express.Response) => {
    try {
        const userId = req.userId!;
        const { name } = req.body;
        // Generate a random mock key (e.g. sgal_live_...)
        const rawKey = `sgal_live_${Math.random().toString(36).substring(2, 15)}`;

        const newKey = await (prisma.apiKey as any).create({
            data: {
                name: name || 'Unnamed Key',
                key: rawKey,
                status: 'Active',
                userId: userId
            }
        });

        res.json(newKey);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get Transaction Logs
app.get('/api/dashboard/logs', verifySupabaseToken, rateLimiters.dashboard.middleware(), async (req: AuthRequest, res: express.Response) => {
    try {
        const userId = req.userId!;
        const { network } = req.query; // Optional filter

        const where: any = { userId };
        if (network === 'mainnet' || network === 'testnet') {
            where.network = network;
        }

        const logs = await (prisma.transaction as any).findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: { apiKey: true }
        });
        res.json(logs);
    } catch (error: any) {
        console.error("Dashboard Logs Error:", error);
        res.json([]); // Return empty list on failure instead of 500
    }
});

app.listen(port, () => {
    console.log(`VelumX Relayer running on port ${port}`);
});
