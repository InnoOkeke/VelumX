# VelumX Relayer Setup Guide

## Overview

The VelumX Relayer sponsors Stacks transactions, allowing users to pay gas fees in USDCx instead of STX.

## Architecture

```
User Wallet → Frontend → Relayer → Stacks Blockchain
     ↓           ↓          ↓
  Signs TX    Sends txRaw  Sponsors & Broadcasts
```

## Environment Variables

### Required
```env
# Database (Supabase PostgreSQL)
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."

# Server
PORT=4000
NODE_ENV=production

# Network
NETWORK=testnet  # or mainnet

# Relayer Private Key (with STX for sponsoring)
RELAYER_PRIVATE_KEY=your_private_key_here

# Paymaster Contract
PAYMASTER_CONTRACT=STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.simple-paymaster-v1

# Token Contracts
USDCX_TOKEN=ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx
```

### Optional (for dashboard auth)
```env
DASHBOARD_PASSWORD=your_secure_password
```

## API Endpoints

### POST /api/v1/estimate
Estimate gas fees for a transaction.

**Request:**
```json
{
  "intent": {
    "estimatedGas": 100000
  }
}
```

**Response:**
```json
{
  "maxFeeUSDCx": "250000",
  "estimatedGas": 100000
}
```

### POST /api/v1/broadcast
Sponsor and broadcast a raw transaction.

**Request:**
```json
{
  "txRaw": "0x808000000..."
}
```

**Response:**
```json
{
  "txid": "0xabc123...",
  "status": "sponsored"
}
```

### POST /api/v1/sponsor (Legacy)
Sponsor a Smart Wallet intent (deprecated).

**Request:**
```json
{
  "intent": {
    "target": "...",
    "payload": "...",
    "maxFeeUSDCx": "250000",
    "nonce": 0,
    "signature": "..."
  }
}
```

## Dashboard Endpoints

### GET /api/dashboard/stats
Get relayer statistics.

**Response:**
```json
{
  "totalTransactions": 150,
  "activeKeys": 5,
  "totalSponsored": "37500000",
  "activeSmartWallets": 100,
  "relayerAddress": "STKYNF...",
  "relayerStxBalance": "1000000000",
  "relayerUsdcxBalance": "5000000"
}
```

### GET /api/dashboard/keys
List API keys.

### POST /api/dashboard/keys
Generate new API key.

### GET /api/dashboard/logs
Get transaction logs.

## Deployment

### Render.com

1. Create new Web Service
2. Connect GitHub repository
3. Set build command: `npm install && npm run build`
4. Set start command: `npm start`
5. Add environment variables from above
6. Deploy!

### Environment Setup

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Build
npm run build

# Start
npm start
```

## Monitoring

### Health Check
```bash
curl https://your-relayer.onrender.com/health
```

### Check Relayer Balance
The relayer needs STX to sponsor transactions. Monitor the balance via:
- Dashboard: `/api/dashboard/stats`
- Stacks Explorer: https://explorer.hiro.so/address/YOUR_RELAYER_ADDRESS

### Recommended STX Balance
- Testnet: 10+ STX
- Mainnet: 100+ STX (depending on volume)

## Security

### Private Key
- Never commit private keys to git
- Use environment variables
- Rotate keys periodically
- Use a dedicated wallet for the relayer

### API Keys
- Generate unique keys per dApp
- Rotate keys if compromised
- Monitor usage via dashboard

### Rate Limiting
Consider adding rate limiting for production:
```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

## Troubleshooting

### Transaction Fails
- Check relayer STX balance
- Verify contract addresses in .env
- Check Stacks network status
- Review transaction logs

### Database Connection Issues
- Verify DATABASE_URL is correct
- Check Supabase connection pooler
- Run `npx prisma migrate deploy`

### Sponsorship Errors
- Ensure private key is valid
- Check key has 01 suffix (compressed)
- Verify network matches (testnet/mainnet)

## Cost Analysis

### Per Transaction
- STX gas cost: ~0.05 STX
- User pays: ~0.25 USDCx
- Relayer profit: ~0.20 USDCx equivalent

### Monthly (1000 transactions)
- STX spent: 50 STX
- USDCx earned: 250 USDCx
- Net profit: ~200 USDCx (if STX price stable)

## Maintenance

### Regular Tasks
- Monitor STX balance
- Review transaction logs
- Update dependencies
- Backup database
- Rotate API keys

### Upgrades
```bash
# Pull latest code
git pull

# Install dependencies
npm install

# Run migrations
npx prisma migrate deploy

# Rebuild
npm run build

# Restart service
# (Render auto-restarts on deploy)
```

---

**Status**: ✅ Production Ready
**Uptime**: Monitor via Render dashboard
**Support**: Check logs at `/api/dashboard/logs`
