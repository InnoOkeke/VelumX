import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PaymasterService } from './PaymasterService.js';
import { getAddressFromPrivateKey } from '@stacks/transactions';
import { STACKS_MAINNET, STACKS_TESTNET } from '@stacks/network';

import { verifySupabaseToken, AuthRequest } from './auth.js';

import { StatusSyncService } from './StatusSyncService.js';

dotenv.config();

const prisma = new PrismaClient();
const statusSync = new StatusSyncService();
statusSync.start();

const app = express();
const port = process.env.PORT || 4000;

// Fix for JSON.stringify with BigInt
(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

app.use(cors({
    origin: (origin, callback) => {
        // Allow all origins in development (no origin) or specific trusted domains
        const allowedPatterns = [
            /localhost:\d+$/,
            /\.vercel\.app$/,
            /sgal-relayer\.onrender\.com$/
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
app.get('/', (req, res) => {
    res.send('<h1>VelumX Relayer is Live</h1><p>Visit <a href="/health">/health</a> for status.</p>');
});

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'VelumX Relayer' });
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

// Estimate Fee Endpoint (Gated)
app.post('/api/v1/estimate', validateApiKey, async (req: ApiKeyRequest, res) => {
    try {
        const { intent } = req.body;
        if (!intent) return res.status(400).json({ error: "Missing intent" });

        const estimation = await paymasterService.estimateFee(intent);
        res.json(estimation);
    } catch (error: any) {
        console.error("Estimation Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Sponsor and Submit Intent Endpoint (Gated)
app.post('/api/v1/sponsor', validateApiKey, async (req: ApiKeyRequest, res) => {
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
app.post('/api/v1/broadcast', validateApiKey, async (req: ApiKeyRequest, res) => {
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
app.get('/api/dashboard/export-key', verifySupabaseToken, async (req: AuthRequest, res) => {
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
app.get('/api/dashboard/stats', verifySupabaseToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.userId!;

        const getNetworkStats = async (networkType: 'mainnet' | 'testnet') => {
            try {
                // 1. Database Stats
                const totalTransactions = await (prisma.transaction as any).count({ 
                    where: { userId, network: networkType } 
                });

                const transactions = await (prisma.transaction as any).findMany({
                    where: { userId, network: networkType },
                    select: { feeAmount: true }
                });

                const totalSponsored = transactions.reduce((acc: bigint, tx: any) => {
                    try {
                        return acc + BigInt(tx.feeAmount || '0');
                    } catch (e) {
                        return acc;
                    }
                }, BigInt(0));

                // 2. On-Chain Metrics
                const relayerKey = paymasterService.getUserRelayerKey(userId);
                const relayerAddress = getAddressFromPrivateKey(relayerKey.replace(/^0x/, ''), networkType as any);

                let relayerStxBalance = "0";
                let relayerUsdcxBalance = "0";

                try {
                    const stxNetwork = networkType === 'mainnet' ? 'mainnet' : 'testnet';
                    const balancesRes = await fetch(`https://api.${stxNetwork}.hiro.so/extended/v1/address/${relayerAddress}/balances`);
                    
                    if (balancesRes.ok) {
                        const balances = await balancesRes.json();
                        relayerStxBalance = balances.stx.balance;

                        const usdcxToken = process.env.USDCX_TOKEN || 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx';
                        const tokenBalance = balances.fungible_tokens[usdcxToken] || balances.fungible_tokens[`${usdcxToken}-v1`];
                        
                        if (tokenBalance) {
                            relayerUsdcxBalance = tokenBalance.balance;
                        }
                    }
                } catch (balanceError) {
                    console.error(`Relayer Stat Error (${networkType}): Failed to fetch on-chain balances`, balanceError);
                }

                return {
                    totalTransactions,
                    totalSponsored: totalSponsored.toString(),
                    relayerAddress,
                    relayerStxBalance,
                    relayerUsdcxBalance
                };
            } catch (err) {
                console.error(`Stats Error for ${networkType}:`, err);
                return { totalTransactions: 0, totalSponsored: "0", relayerAddress: "Error", relayerStxBalance: "0", relayerUsdcxBalance: "0" };
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
app.get('/api/dashboard/keys', verifySupabaseToken, async (req: AuthRequest, res) => {
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
app.post('/api/dashboard/keys', verifySupabaseToken, async (req: AuthRequest, res) => {
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
app.get('/api/dashboard/logs', verifySupabaseToken, async (req: AuthRequest, res) => {
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
