import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PaymasterService } from './PaymasterService';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const paymasterService = new PaymasterService();

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

app.listen(port, () => {
    console.log(`SGAL Relayer running on port ${port}`);
});
