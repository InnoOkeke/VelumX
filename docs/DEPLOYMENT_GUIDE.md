# VelumX Deployment Guide

Complete guide for deploying the VelumX Paymaster infrastructure and DeFi app.

## 📁 Project Structure

```
VelumX/
├── velumx/                    # VelumX Paymaster Infrastructure
│   ├── dashboard/            # Developer dashboard (Vercel)
│   ├── sdk/                  # @velumx/sdk package (NPM)
│   ├── relayer/              # Paymaster relayer (Render)
│   └── contracts/            # Smart contracts (Stacks)
│
└── frontend/                  # DeFi App - Bridge & Swap (Vercel)
```

## 🚀 Deployment Order

### 1. Smart Contracts (Stacks Blockchain)

**Location:** `velumx/contracts/`

**Contracts to Deploy:**
- `paymaster-module-v10.clar` - Fee settlement in USDCx
- `smart-wallet-v11.clar` - Account abstraction wallet
- `wallet-factory-v8.clar` - Smart wallet deployment
- `relayer-registry-v3.clar` - Relayer management
- `swap-v3.clar` - AMM for token swaps

**Steps:**
```bash
cd velumx/contracts
npm install
clarinet integrate  # Deploy to testnet
```

**Update Environment Variables** with deployed contract addresses.

---

### 2. Relayer Service (Render)

**Location:** `velumx/relayer/`

**Service:** Express.js API for transaction sponsorship

**Environment Variables:**
```env
# Network
NETWORK=testnet
STACKS_RPC_URL=https://api.testnet.hiro.so

# Relayer Wallet
RELAYER_PRIVATE_KEY=your_relayer_private_key_here

# Contracts
SMART_WALLET_CONTRACT=STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.smart-wallet-v11
PAYMASTER_CONTRACT=STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.paymaster-module-v10
USDCX_TOKEN=ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx

# Fee Configuration
PAYMASTER_MARKUP=8
ORACLE_UPDATE_INTERVAL=60000

# Database (PostgreSQL)
DATABASE_URL=postgresql://user:password@host:5432/velumx_relayer

# API Security
VELUMX_API_KEY=your_api_key_here
CORS_ORIGINS=https://dashboard.velumx.com,https://app.velumx.com
```

**Render Configuration:**
```yaml
services:
  - type: web
    name: velumx-relayer
    env: node
    region: oregon
    plan: starter
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 4000
```

**Deploy:**
1. Push to GitHub
2. Connect to Render
3. Add environment variables
4. Deploy

**Endpoints:**
- `POST /api/v1/estimate` - Fee estimation
- `POST /api/v1/sponsor` - Intent sponsorship
- `POST /api/v1/broadcast` - Raw transaction broadcast
- `GET /api/v1/health` - Health check

---

### 3. VelumX SDK (NPM)

**Location:** `velumx/sdk/`

**Package:** `@velumx/sdk`

**Build & Publish:**
```bash
cd velumx/sdk
npm install
npm run build
npm publish --access public
```

**Version:** 1.4.0

**Usage:**
```typescript
import { VelumXClient } from '@velumx/sdk';

const client = new VelumXClient({
  coreApiUrl: 'https://api.testnet.hiro.so',
  network: 'testnet',
  paymasterUrl: 'https://velumx-relayer.onrender.com/api/v1',
  apiKey: 'your-api-key'
});
```

---

### 4. Developer Dashboard (Vercel)

**Location:** `velumx/dashboard/`

**Purpose:** dApp registration, API key management, analytics

**Environment Variables:**
```env
# Relayer API
NEXT_PUBLIC_VELUMX_RELAYER_URL=https://velumx-relayer.onrender.com

# Stacks Network
NEXT_PUBLIC_STACKS_NETWORK=testnet
NEXT_PUBLIC_STACKS_API_URL=https://api.testnet.hiro.so

# Contract Addresses
NEXT_PUBLIC_WALLET_FACTORY=STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.wallet-factory-v8
NEXT_PUBLIC_RELAYER_REGISTRY=STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.relayer-registry-v3
```

**Deploy to Vercel:**
```bash
cd velumx/dashboard
vercel --prod
```

**Features:**
- dApp registration
- API key generation
- Usage analytics
- Transaction logs
- Relayer funding

**URL:** `https://dashboard.velumx.com`

---

### 5. DeFi App - Bridge & Swap (Vercel)

**Location:** `frontend/`

**Purpose:** Cross-chain bridge and token swap with gasless transactions

**Environment Variables:**
```env
# Backend API
NEXT_PUBLIC_BACKEND_URL=

# Network Configuration
NEXT_PUBLIC_ETHEREUM_CHAIN_ID=11155111
NEXT_PUBLIC_STACKS_NETWORK=testnet

# VelumX SDK
NEXT_PUBLIC_VELUMX_API_KEY=
NEXT_PUBLIC_VELUMX_RELAYER_URL=https://velumx-relayer.onrender.com/api/v1

# Ethereum Contracts
NEXT_PUBLIC_ETHEREUM_USDC_ADDRESS=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
NEXT_PUBLIC_ETHEREUM_XRESERVE_ADDRESS=0x008888878f94C0d87defdf0B07f46B93C1934442

# Stacks Contracts
NEXT_PUBLIC_STACKS_USDCX_ADDRESS=ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx
NEXT_PUBLIC_STACKS_USDCX_PROTOCOL_ADDRESS=ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx-v1
NEXT_PUBLIC_STACKS_PAYMASTER_ADDRESS=STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.paymaster-module-v10
NEXT_PUBLIC_STACKS_SMART_WALLET_ADDRESS=STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.smart-wallet-v11
NEXT_PUBLIC_STACKS_WALLET_FACTORY_ADDRESS=STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.wallet-factory-v8
NEXT_PUBLIC_STACKS_SWAP_CONTRACT_ADDRESS=STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.swap-v3
NEXT_PUBLIC_STACKS_VEX_ADDRESS=STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.vextoken-v1

# Domain IDs
NEXT_PUBLIC_ETHEREUM_DOMAIN_ID=0
NEXT_PUBLIC_STACKS_DOMAIN_ID=10003

# Explorer URLs
NEXT_PUBLIC_ETHEREUM_EXPLORER_URL=https://sepolia.etherscan.io
NEXT_PUBLIC_STACKS_EXPLORER_URL=https://explorer.hiro.so
```

**Deploy to Vercel:**
```bash
cd frontend
vercel --prod
```

**Features:**
- Cross-chain USDC bridge (Ethereum ↔ Stacks)
- Token swap (STX, USDCx, VEX)
- Gasless transactions (pay fees in USDCx)
- Automatic Smart Wallet management
- Transaction monitoring

**URL:** `https://app.velumx.com`

---

## 🔧 Post-Deployment Configuration

### 1. Fund Relayer Wallet

The relayer needs STX to sponsor transactions:

```bash
# Send STX to relayer address
# Minimum: 100 STX for testnet
# Recommended: 1000 STX for production
```

### 2. Register Relayer

Register the relayer in the registry contract:

```clarity
(contract-call? .relayer-registry-v3 register-relayer
  tx-sender  ;; relayer address
  u100       ;; stake amount
  "VelumX Official Relayer"
)
```

### 3. Update Oracle Prices

Set initial STX/USD price in paymaster:

```clarity
(contract-call? .paymaster-module-v10 update-oracle
  u2000000  ;; $2.00 per STX (in micro-USD)
)
```

### 4. Create Liquidity Pools

Initialize swap pools for gasless swaps:

```clarity
;; USDCx/VEX pool
(contract-call? .swap-v3 create-pool
  'ST...ADMIN.usdcx
  'ST...ADMIN.vextoken-v1
  u1000000000  ;; 1000 USDCx
  u1000000000  ;; 1000 VEX
)

;; STX/USDCx pool
(contract-call? .swap-v3 create-pool-stx
  'ST...ADMIN.usdcx
  u1000000000  ;; 1000 STX
  u1000000000  ;; 1000 USDCx
)
```

---

## 🧪 Testing Checklist

### Relayer Service
- [ ] Health check endpoint responds
- [ ] Fee estimation works
- [ ] Intent sponsorship succeeds
- [ ] Raw transaction broadcast works
- [ ] Database connection established
- [ ] API key validation works

### Developer Dashboard
- [ ] dApp registration works
- [ ] API keys generated successfully
- [ ] Analytics display correctly
- [ ] Transaction logs visible
- [ ] Wallet connection works

### DeFi App
- [ ] Wallet connection (Ethereum + Stacks)
- [ ] Bridge: Ethereum → Stacks
- [ ] Bridge: Stacks → Ethereum (gasless)
- [ ] Swap: Token to token (gasless)
- [ ] Smart Wallet auto-registration
- [ ] Fund consolidation automatic
- [ ] Transaction monitoring

### SDK Integration
- [ ] NPM package published
- [ ] Documentation accessible
- [ ] Example code works
- [ ] TypeScript types correct

---

## 📊 Monitoring

### Relayer Metrics
- Transaction success rate
- Average response time
- STX balance
- USDCx fee collection
- Error rates

### Dashboard Metrics
- Active dApps
- API key usage
- Transaction volume
- Fee revenue

### DeFi App Metrics
- Bridge volume
- Swap volume
- Gasless transaction %
- User retention

---

## 🔒 Security Considerations

### Relayer
- ✅ Private key stored in environment variables
- ✅ API key validation for production
- ✅ Rate limiting on endpoints
- ✅ CORS configuration
- ✅ Input validation
- ✅ Transaction amount limits

### Smart Contracts
- ✅ Access control (admin functions)
- ✅ Reentrancy protection
- ✅ Integer overflow checks
- ✅ Post-condition validation
- ✅ Nonce-based replay protection

### Frontend
- ✅ Environment variables for sensitive data
- ✅ Client-side signature verification
- ✅ Transaction confirmation prompts
- ✅ Balance checks before transactions

---

## 🆘 Troubleshooting

### Relayer Not Responding
1. Check Render logs
2. Verify environment variables
3. Check STX balance
4. Verify database connection

### Gasless Transactions Failing
1. Check Smart Wallet registration
2. Verify USDCx balance
3. Check fee estimate
4. Verify signature format

### Bridge Transactions Stuck
1. Check Ethereum transaction status
2. Verify Circle attestation
3. Check Stacks transaction status
4. Monitor transaction logs

---

## 📞 Support

- **Documentation:** https://docs.velumx.com
- **Dashboard:** https://dashboard.velumx.com
- **Discord:** https://discord.gg/velumx
- **Email:** support@velumx.com

---

## 🎉 Launch Checklist

- [ ] All contracts deployed
- [ ] Relayer service running
- [ ] SDK published to NPM
- [ ] Dashboard deployed
- [ ] DeFi app deployed
- [ ] Relayer funded with STX
- [ ] Relayer registered
- [ ] Oracle prices set
- [ ] Liquidity pools created
- [ ] Documentation published
- [ ] Monitoring configured
- [ ] Security audit completed
- [ ] Announcement prepared

---

**Congratulations! You're ready to launch the first Paymaster infrastructure on Stacks! 🚀**
