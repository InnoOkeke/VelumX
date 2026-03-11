# VelumX Architecture Overview

## Project Structure

```
VelumX/
├── frontend/                    # DeFi Application (Public)
│   ├── components/             # Swap, Bridge, Liquidity UI
│   ├── lib/
│   │   ├── helpers/           # simple-gasless-bridge.ts, simple-gasless-swap.ts
│   │   └── services/          # SwapQuoteService, StacksMintService
│   └── Uses: @velumx/sdk directly (no API keys)
│
└── velumx/                     # Developer Tools (Private)
    ├── sdk/                    # @velumx/sdk package (published to npm)
    ├── relayer/                # Backend service for sponsored transactions
    │   ├── Uses: Supabase DB for API key validation
    │   └── Sponsors transactions via simple-paymaster-v1
    └── dashboard/              # Developer portal (this project)
        ├── Auth: Supabase (Email + GitHub)
        ├── Features: API key generation, usage logs
        └── Database: Same Supabase as relayer
```

## Two Separate Use Cases

### 1. VelumX DeFi (Your App)
**Purpose**: Public DeFi application for swapping, bridging, and liquidity

**How it works**:
- Users connect their Stacks wallet
- Frontend uses `@velumx/sdk` directly
- Transactions are sponsored by `simple-paymaster-v1` contract
- No API keys needed - direct blockchain interaction

**Code Example**:
```typescript
import { sponsorTransaction } from '@velumx/sdk'

// Direct usage - no API key
const sponsored = await sponsorTransaction({
  transaction: unsignedTx,
  network: 'testnet'
})
```

### 2. VelumX Developer Platform (For Other Devs)
**Purpose**: Allow other developers to integrate gasless transactions into their apps

**How it works**:
1. Developer signs up on dashboard (email/GitHub)
2. Generates API key (e.g., `vx_abc123...`)
3. Funds their relayer balance
4. Uses API key in their backend to sponsor transactions for their users

**Code Example** (for external developers):
```typescript
import { VelumXClient } from '@velumx/sdk'

// Backend usage with API key
const client = new VelumXClient({
  apiKey: process.env.VELUMX_API_KEY, // vx_abc123...
  network: 'testnet'
})

const sponsored = await client.sponsorTransaction(unsignedTx)
```

## Database Schema

### Supabase Database (Shared by Relayer + Dashboard)

**ApiKey Table**:
- `id`: Unique identifier
- `userId`: Supabase Auth user ID
- `name`: Developer-friendly name
- `key`: API key (vx_...)
- `createdAt`: Timestamp
- `revokedAt`: Null if active

**UsageLog Table**:
- `id`: Unique identifier
- `apiKeyId`: Foreign key to ApiKey
- `endpoint`: API endpoint called
- `method`: HTTP method
- `statusCode`: Response status
- `responseTime`: Latency in ms
- `createdAt`: Timestamp

## Authentication Flow

### Dashboard (Supabase Auth)
1. User visits `/auth/signin`
2. Signs in with Email or GitHub
3. Supabase creates session
4. Middleware protects dashboard routes
5. User can generate API keys

### DeFi Frontend (Wallet Auth)
1. User clicks "Connect Wallet"
2. Stacks wallet extension opens
3. User approves connection
4. Frontend gets wallet address
5. User can swap/bridge/add liquidity

## Smart Contracts

### simple-paymaster-v1
- **Address**: `STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.simple-paymaster-v1`
- **Purpose**: Sponsors transaction fees
- **Funded by**: You (for DeFi app) or API key holders (for their apps)

### USDCx Protocol
- **Token**: `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx`
- **Protocol**: `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx-v1`
- **Purpose**: Bridge token between Ethereum and Stacks

### Swap Contract
- **Address**: `STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.swap-v9-stx`
- **Purpose**: DEX for swapping tokens

## Deployment

### Frontend (Vercel)
- Serverless deployment
- No backend database
- Fetches transaction history from blockchain explorers
- Environment: `frontend/.env.local`

### Dashboard (Vercel/Render)
- Next.js app with API routes
- Connected to Supabase database
- Environment: `velumx/dashboard/.env.local`

### Relayer (Render)
- Node.js backend service
- Connected to Supabase database
- Validates API keys
- Sponsors transactions
- Environment: `velumx/relayer/.env`

## Current Status

✅ **Completed**:
- Simple paymaster migration
- Frontend DeFi app (swap, bridge, liquidity)
- SDK published to npm (`@velumx/sdk@2.0.0`)
- Dashboard with Supabase Auth
- API key generation system
- Database schema

⏳ **Pending**:
- Get Supabase credentials (URL, anon key, service role key)
- Configure GitHub OAuth in Supabase
- Test dashboard authentication
- Implement usage logging in relayer
- Add funding management UI

🔄 **Deferred**:
- Swap quote issues (no liquidity pool found)
- Liquidity pool browser
- Transaction monitoring improvements

## Security Notes

1. **API Keys**: Store securely, never expose in client-side code
2. **Service Role Key**: Only use on backend, never in frontend
3. **Database**: Use Row Level Security (RLS) in Supabase
4. **Paymaster**: Monitor balance to prevent abuse
5. **Rate Limiting**: Implement in relayer for API key usage
