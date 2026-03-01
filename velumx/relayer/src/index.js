"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const PaymasterService_1 = require("./PaymasterService");
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 4000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const paymasterService = new PaymasterService_1.PaymasterService();
// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'SGAL Relayer' });
});
// Estimate Fee Endpoint
app.post('/api/v1/estimate', async (req, res) => {
    try {
        const { intent } = req.body;
        if (!intent)
            return res.status(400).json({ error: "Missing intent" });
        const estimation = await paymasterService.estimateFee(intent);
        res.json(estimation);
    }
    catch (error) {
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
    }
    catch (error) {
        console.error("Sponsorship Error:", error);
        res.status(500).json({ error: error.message });
    }
});
app.listen(port, () => {
    console.log(`SGAL Relayer running on port ${port}`);
});
//# sourceMappingURL=index.js.map