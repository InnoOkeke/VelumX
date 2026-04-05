# VelumX Relayer

> The core sponsorship engine for the VelumX platform. A multi-tenant, high-performance service that enables gasless transactions on Stacks.

## Features

- 💎 **Universal Sponsorship** - Supports any SIP-010 token for gas fees via a traits-based paymaster.
- 🏢 **Multi-Tenant Architecture** - Segregated API keys and relayer wallets for different developers/dApps.
- 📊 **Dynamic Fee Reporting** - Allows dApps to report custom collected fees for accurate dashboard analytics.
- ⚡ **Optimized Gas** - Low-cost sponsorship (0.001 STX) for maximum efficiency.
- 🔍 **Transaction Introspection** - Automatically extracts user addresses and fee data from raw Stacks transactions.

## API Reference (v1)

All endpoints require an `x-api-key` header obtained from the [VelumX Dashboard](https://dashboard.velumx.xyz).

### `POST /api/v1/broadcast`
Broadcasts and sponsors a raw Stacks transaction.

**Body:**
```json
{
  "txHex": "0x...",
  "userId": "optional-custom-user-id",
  "feeAmount": "250000" // Optional: Specific fee collected (in 6-decimal units)
}
```

### `POST /api/v1/estimate`
Estimates the Universal Token fee required for a specific transaction intent.

### `GET /api/dashboard/stats`
Returns multi-tenant analytics for the authenticated developer (Total Transactions, Revenue, Relayer Health).

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Service port | `4000` |
| `DATABASE_URL` | PostgreSQL (Prisma) connection string | Required |
| `RELAYER_KEY` | Primary relayer private key | Required |
| `NETWORK` | Stacks network (`mainnet` or `testnet`) | `testnet` |
| `FALLBACK_FEE_TOKENS` | Default fallback fee label for logging | `250000` |

## Deployment

The VelumX Relayer is optimized for **Render** or **Vercel** deployment.

```bash
npm install
npx prisma generate
npm run build
npm start
```
