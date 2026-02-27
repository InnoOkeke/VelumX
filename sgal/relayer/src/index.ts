import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PaymasterService } from './PaymasterService.js';

dotenv.config();

const prisma = new PrismaClient();

const app = express();
const port = process.env.PORT || 4000;

// Fix for JSON.stringify with BigInt
(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

app.use(cors());
app.use(express.json());

const paymasterService = new PaymasterService();

// Root Route
app.get('/', (req, res) => {
    res.send('<h1>SGAL Relayer is Live</h1><p>Visit <a href="/health">/health</a> for status.</p>');
});

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'SGAL Relayer' });
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

// ==========================================
// Dashboard Analytics Endpoints
// ==========================================

// Get Analytics Overview
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const totalTransactions = await prisma.transaction.count();
        const activeKeys = await prisma.apiKey.count({ where: { status: 'Active' } });

        // Sum total sponsored amount (using string parsed to BigInt to prevent overflow)
        const transactions = await prisma.transaction.findMany({ select: { feeAmount: true } });
        let totalSponsored = BigInt(0);
        for (const tx of transactions) {
            totalSponsored += BigInt(tx.feeAmount || '0');
        }

        res.json({
            totalTransactions,
            activeKeys,
            totalSponsored: totalSponsored.toString(),
            activeSmartWallets: 0 // To be fetched from on-chain factory events 
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get API Keys
app.get('/api/dashboard/keys', async (req, res) => {
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
app.post('/api/dashboard/keys', async (req, res) => {
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
app.get('/api/dashboard/logs', async (req, res) => {
    try {
        const logs = await prisma.transaction.findMany({
            orderBy: { createdAt: 'desc' },
            take: 50,
            include: { apiKey: true }
        });
        res.json(logs);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`SGAL Relayer running on port ${port}`);
});
