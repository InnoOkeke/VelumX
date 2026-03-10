# VelumX Dashboard Deployment Guide

## ✅ Status: Ready to Deploy

The dashboard API integration is complete. The relayer already has all necessary endpoints.

## Architecture

```
┌─────────────────────┐
│  VelumX Dashboard   │  (Vercel)
│  dashboard.velumx   │
└──────────┬──────────┘
           │ HTTPS
           ▼
┌─────────────────────┐
│  VelumX Relayer     │  (Render)
│  API Endpoints      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  PostgreSQL DB      │  (Render)
│  API Keys & Logs    │
└─────────────────────┘
```

## Relayer API Endpoints (Already Implemented)

### Dashboard Endpoints
- `GET /api/dashboard/stats` - Overview statistics
- `GET /api/dashboard/keys` - List API keys
- `POST /api/dashboard/keys` - Generate new API key
- `GET /api/dashboard/logs` - Transaction logs

### Paymaster Endpoints
- `POST /api/v1/estimate` - Fee estimation
- `POST /api/v1/sponsor` - Intent sponsorship
- `POST /api/v1/broadcast` - Raw transaction broadcast

## Deployment Steps

### 1. Deploy Relayer to Render

**Environment Variables:**
```env
# Network
NETWORK=testnet
PORT=4000

# Database
DATABASE_URL=postgresql://user:password@host:5432/velumx_relayer

# Relayer Wallet
RELAYER_PRIVATE_KEY=your_private_key_here

# Contracts
SMART_WALLET_CONTRACT=STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.smart-wallet-v11
PAYMASTER_CONTRACT=STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.paymaster-module-v10
USDCX_TOKEN=ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx

# Dashboard Auth (Optional)
DASHBOARD_PASSWORD=your_secure_password_here
```

**Build Command:**
```bash
npm install && npm run build
```

**Start Command:**
```bash
npm start
```

**After Deployment:**
```bash
# Run database migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate
```

### 2. Deploy Dashboard to Vercel

**Environment Variables:**
```env
NEXT_PUBLIC_VELUMX_RELAYER_URL=https://your-relayer.onrender.com
NEXT_PUBLIC_STACKS_NETWORK=testnet
NEXT_PUBLIC_STACKS_API_URL=https://api.testnet.hiro.so
NEXT_PUBLIC_WALLET_FACTORY=STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.wallet-factory-v8
NEXT_PUBLIC_RELAYER_REGISTRY=STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.relayer-registry-v3
```

**Build Command:**
```bash
npm install && npm run build
```

**Deploy:**
```bash
cd velumx/dashboard
vercel --prod
```

### 3. Initialize Database

On Render, run these commands once:

```bash
# Create tables
npx prisma migrate deploy

# Seed with initial data (optional)
npx prisma db seed
```

## Testing the Dashboard

### 1. Check Relayer Health
```bash
curl https://your-relayer.onrender.com/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "VelumX Relayer"
}
```

### 2. Test Dashboard Stats
```bash
curl https://your-relayer.onrender.com/api/dashboard/stats
```

Expected response:
```json
{
  "totalTransactions": 0,
  "activeKeys": 0,
  "totalSponsored": "0",
  "activeSmartWallets": 0,
  "relayerAddress": "ST...",
  "relayerStxBalance": "1000000",
  "relayerUsdcxBalance": "0"
}
```

### 3. Generate API Key
```bash
curl -X POST https://your-relayer.onrender.com/api/dashboard/keys \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Key"}'
```

Expected response:
```json
{
  "id": "uuid",
  "name": "Test Key",
  "key": "sgal_live_abc123...",
  "status": "Active",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### 4. Visit Dashboard
Open: `https://dashboard.velumx.com`

You should see:
- ✅ Overview with stats
- ✅ API Keys page (can generate keys)
- ✅ Transaction logs
- ✅ Funding page

## Dashboard Features

### Overview Page
- Total gas sponsored (USDCx)
- Active API keys count
- Total transactions
- 7-day sponsorship chart
- Recent activity feed

### API Keys Page
- List all API keys
- Generate new keys
- Copy keys to clipboard
- View key status (Active/Inactive)

### Funding Page
- View relayer STX balance
- View relayer USDCx balance
- Fund relayer wallet

### Transaction Logs
- View all sponsored transactions
- Filter by status
- Search by txid
- Export logs

## Security Notes

### Dashboard Authentication (Optional)

The dashboard endpoints now support optional authentication:

1. Set `DASHBOARD_PASSWORD` in Render environment variables
2. Dashboard will need to send this in Authorization header:
   ```
   Authorization: Bearer your_password_here
   ```

If `DASHBOARD_PASSWORD` is not set, endpoints are open (for development).

### API Key Validation

For production, implement API key validation on paymaster endpoints:

```typescript
const validateApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }
  
  const key = await prisma.apiKey.findUnique({
    where: { key: apiKey, status: 'Active' }
  });
  
  if (!key) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  req.apiKey = key;
  next();
};

// Apply to paymaster endpoints
app.post('/api/v1/sponsor', validateApiKey, async (req, res) => {
  // ... existing code
});
```

## Monitoring

### Relayer Health
- Check `/health` endpoint every 5 minutes
- Alert if down for > 10 minutes

### Database
- Monitor connection pool
- Check query performance
- Set up automated backups

### API Usage
- Track requests per API key
- Monitor error rates
- Set up rate limiting

## Troubleshooting

### Dashboard shows "Relayer Offline"
1. Check Render logs: `https://dashboard.render.com`
2. Verify `NEXT_PUBLIC_VELUMX_RELAYER_URL` is correct
3. Check CORS settings in relayer

### "Failed to fetch keys"
1. Check database connection
2. Run `npx prisma migrate deploy`
3. Verify DATABASE_URL is correct

### API key generation fails
1. Check Prisma client is generated
2. Verify database schema is up to date
3. Check Render logs for errors

## Maintenance

### Update Relayer
```bash
git pull
npm install
npm run build
# Render will auto-deploy
```

### Update Dashboard
```bash
git pull
npm install
vercel --prod
```

### Database Migrations
```bash
# Create new migration
npx prisma migrate dev --name migration_name

# Deploy to production
npx prisma migrate deploy
```

## Next Steps

1. ✅ Deploy relayer to Render
2. ✅ Set up PostgreSQL database
3. ✅ Run database migrations
4. ✅ Deploy dashboard to Vercel
5. ✅ Test all endpoints
6. ✅ Generate first API key
7. ✅ Test gasless transactions from frontend

---

**Dashboard is ready to go live! 🚀**
