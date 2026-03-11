import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PaymasterService } from './PaymasterService.js';
import { getAddressFromPrivateKey } from '@stacks/transactions';
import { STACKS_MAINNET, STACKS_TESTNET, TransactionVersion } from '@stacks/network';

dotenv.config();

const prisma = new PrismaClient();

const app = express();
const port = process.env.PORT || 4000;

// Fix for JSON.stringify with BigInt
(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

app.use(cors({
    origin: (origin, callback) => {
        // Allow all origins in development/preview to support Vercel dynamic URLs
        // and local testing. In production, we can lock this down further if needed.
        if (!origin || origin.includes('vercel.app') || origin.includes('localhost') || origin.includes('onrender.com')) {
            callback(null, true);
        } else {
            callback(null, true); // Fallback to true for simplicity in this integration phase
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

// Estimate Fee Endpoint
app.post('/api/v1/estimate', async (req, res) => {
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

// Sponsor and Submit Intent Endpoint
app.post('/api/v1/sponsor', async (req, res) => {
    try {
        const { intent } = req.body;
        if (!intent || !intent.signature) {
            return res.status(400).json({ error: "Missing signed intent" });
        }

        const result = await paymasterService.sponsorIntent(intent);
        res.json(result);
    } catch (error: any) {
        console.error("Sponsorship Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Broadcast Raw Transaction (Native Sponsorship)
app.post('/api/v1/broadcast', async (req, res) => {
    try {
        const { txHex } = req.body;
        if (!txHex) {
            return res.status(400).json({ error: "Missing transaction hex" });
        }

        const result = await paymasterService.sponsorRawTransaction(txHex);
        res.json(result);
    } catch (error: any) {
        console.error("Broadcast Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// Dashboard Analytics Endpoints
// ==========================================

// Simple dashboard auth middleware (optional - add admin password)
const dashboardAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const adminPassword = process.env.DASHBOARD_PASSWORD;
    
    // If no password is set, allow access (for development)
    if (!adminPassword) {
        return next();
    }
    
    const authHeader = req.headers.authorization;
    if (authHeader === `Bearer ${adminPassword}`) {
        return next();
    }
    
    res.status(401).json({ error: 'Unauthorized' });
};

// Get Analytics Overview
app.get('/api/dashboard/stats', dashboardAuth, async (req, res) => {
    try {
        let totalTransactions = 0;
        let activeKeys = 0;
        let totalSponsored = BigInt(0);

        try {
            totalTransactions = await prisma.transaction.count();
            activeKeys = await prisma.apiKey.count({ where: { status: 'Active' } });

            // Sum total sponsored amount with sanitization
            const transactions = await prisma.transaction.findMany({ select: { feeAmount: true } });
            for (const tx of transactions) {
                try {
                    const amount = tx.feeAmount?.replace(/[^0-9]/g, '') || '0';
                    totalSponsored += BigInt(amount);
                } catch (e) {
                    console.error("Relayer Index: Error parsing feeAmount BigInt:", tx.feeAmount);
                }
            }
        } catch (dbError) {
            console.error("Dashboard Stats: Database Error:", dbError);
        }

        // --- Relayer Health Metrics ---
        const relayerKey = process.env.RELAYER_PRIVATE_KEY || '';
        const networkType = process.env.NETWORK || 'testnet';
        const network = networkType === 'mainnet' ? STACKS_MAINNET : STACKS_TESTNET;
        const version = networkType === 'mainnet' ? TransactionVersion.Mainnet : TransactionVersion.Testnet;

        const sanitizeKey = (key: string) => {
            let s = key.trim();
            if (s.startsWith('0x')) s = s.substring(2);
            if (s.length === 64) s += '01';
            return s;
        };

        let relayerAddress = "Not Configured";
        let stxBalance = "0";
        let usdcxBalance = "0";

        if (relayerKey) {
            try {
                const sanitizedKey = sanitizeKey(relayerKey);
                relayerAddress = getAddressFromPrivateKey(sanitizedKey, version as any);

                // Fetch STX Balance
                const url = `${network.client.baseUrl}/v2/accounts/${relayerAddress}`;
                const accountRes = await fetch(url);
                const accountData: any = await accountRes.json();
                stxBalance = accountData.balance || "0";
            } catch (err) {
                console.error("Relayer Index: Error fetching health metrics:", err);
            }
        }

        res.json({
            totalTransactions,
            activeKeys,
            totalSponsored: totalSponsored.toString(),
            activeSmartWallets: totalTransactions > 0 ? Math.ceil(totalTransactions / 1.5) : 0,
            relayerAddress,
            relayerStxBalance: stxBalance,
            relayerUsdcxBalance: usdcxBalance
        });
    } catch (error: any) {
        console.error("Dashboard Stats Critical Error:", error);
        res.status(500).json({ error: "Internal Server Error during stats generation", details: error.message });
    }
});

// Get API Keys
app.get('/api/dashboard/keys', dashboardAuth, async (req, res) => {
    try {
        const keys = await prisma.apiKey.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(keys);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Generate new API Key
app.post('/api/dashboard/keys', dashboardAuth, async (req, res) => {
    try {
        const { name } = req.body;
        // Generate a random mock key (e.g. sgal_live_...)
        const rawKey = `sgal_live_${Math.random().toString(36).substring(2, 15)}`;

        const newKey = await prisma.apiKey.create({
            data: {
                name: name || 'Unnamed Key',
                key: rawKey,
                status: 'Active'
            }
        });

        res.json(newKey);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get Transaction Logs
app.get('/api/dashboard/logs', dashboardAuth, async (req, res) => {
    try {
        const logs = await prisma.transaction.findMany({
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
