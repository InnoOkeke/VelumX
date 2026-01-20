# Environment Setup Guide

## Quick Setup (5 Minutes)

### 1. Backend Setup

```bash
cd backend

# Copy example file
cp .env.example .env

# Edit .env and fill in these values:
# RELAYER_PRIVATE_KEY=your_private_key_here
# RELAYER_STACKS_ADDRESS=your_stacks_address_here
# RELAYER_SEED_PHRASE=your twelve word seed phrase here
# STACKS_PAYMASTER_ADDRESS=STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.paymaster-v3
```

### 2. Frontend Setup

```bash
cd frontend

# Copy example file
cp .env.local.example .env.local

# Edit .env.local and fill in:
# NEXT_PUBLIC_STACKS_PAYMASTER_ADDRESS=STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.paymaster-v3
# NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

### 3. Verify Setup

```bash
# Check files are ignored
git check-ignore backend/.env frontend/.env.local

# Should output:
# backend/.env
# frontend/.env.local
```

## Environment Variables Reference

### Backend (.env)

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `ETHEREUM_RPC_URL` | Ethereum RPC endpoint | `https://sepolia.infura.io/v3/KEY` | Yes |
| `STACKS_RPC_URL` | Stacks RPC endpoint | `https://api.testnet.hiro.so` | Yes |
| `RELAYER_PRIVATE_KEY` | Relayer's private key | `00f64f...` | Yes |
| `RELAYER_STACKS_ADDRESS` | Relayer's Stacks address | `STKY...` | Yes |
| `RELAYER_SEED_PHRASE` | Relayer's 12-word seed | `company build...` | Yes |
| `STACKS_PAYMASTER_ADDRESS` | Deployed paymaster contract | `STKY...paymaster-v3` | Yes |
| `MIN_STX_BALANCE` | Minimum STX for relayer | `10000000` (10 STX) | No |
| `PORT` | Backend server port | `3001` | No |
| `PAYMASTER_MARKUP` | Fee markup percentage | `5` | No |

### Frontend (.env.local)

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `NEXT_PUBLIC_BACKEND_URL` | Backend API URL | `http://localhost:3001` | Yes |
| `NEXT_PUBLIC_ETHEREUM_CHAIN_ID` | Ethereum chain ID | `11155111` (Sepolia) | Yes |
| `NEXT_PUBLIC_STACKS_NETWORK` | Stacks network | `testnet` | Yes |
| `NEXT_PUBLIC_STACKS_PAYMASTER_ADDRESS` | Paymaster contract | `STKY...paymaster-v3` | Yes |

## Current Testnet Values

### Deployed Contracts

**Paymaster Contract:**
- Address: `STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.paymaster-v3`
- Network: Stacks Testnet
- Explorer: https://explorer.hiro.so/txid/b51c675e0705a182b8e8949b36553d90b2479ffb91c10bc669e156c9a9d7738a?chain=testnet

**USDCx Protocol:**
- Token: `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx`
- Protocol: `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx-v1`

**Ethereum Contracts (Sepolia):**
- USDC: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`
- xReserve: `0x008888878f94C0d87defdf0B07f46B93C1934442`

### Relayer Account

**Address:** `STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P`

**Private Key:** `your_private_key_here` (stored securely in .env)

**Seed Phrase:** `your twelve word seed phrase here` (stored securely in .env)

**⚠️ WARNING:** These are testnet credentials. Never use for mainnet!

## Common Issues

### "Missing required environment variables"

**Problem:** Backend won't start

**Solution:**
```bash
cd backend
cp .env.example .env
# Edit .env and fill in all required values
```

### "RELAYER_SEED_PHRASE is not defined"

**Problem:** Deployment script fails

**Solution:**
```bash
# Add to backend/.env:
RELAYER_SEED_PHRASE=your twelve word seed phrase here
```

### "Contract not found"

**Problem:** Frontend can't find paymaster

**Solution:**
```bash
# Add to frontend/.env.local:
NEXT_PUBLIC_STACKS_PAYMASTER_ADDRESS=STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.paymaster-v3
```

### ".env file is tracked by git"

**Problem:** Git wants to commit .env

**Solution:**
```bash
# Remove from git tracking
git rm --cached backend/.env
git rm --cached frontend/.env.local

# Verify .gitignore includes:
# .env
# .env.local
```

## Security Reminders

### ✅ DO
- Use `.env.example` as template
- Keep `.env` files local only
- Add `.env` to `.gitignore`
- Use different keys for dev/prod
- Rotate keys regularly

### ❌ DON'T
- Commit `.env` files to git
- Share `.env` files via email/Slack
- Use production keys in development
- Hardcode secrets in code
- Push secrets to public repos

## Testing Your Setup

### 1. Backend Test
```bash
cd backend
npm run dev

# Should see:
# Server running on port 3001
# Services initialized successfully
```

### 2. Frontend Test
```bash
cd frontend
npm run dev

# Should see:
# ▲ Next.js 16.1.3
# - Local: http://localhost:3000
```

### 3. Deployment Test
```bash
cd backend
node deploy-paymaster.js

# Should load from .env successfully
# Should NOT show hardcoded values
```

## Getting Help

1. **Quick Start:** `.kiro/docs/QUICK_START.md`
2. **Security Guide:** `SECURITY.md`
3. **Integration Guide:** `.kiro/docs/PAYMASTER_INTEGRATION.md`
4. **Deployment Checklist:** `.kiro/docs/DEPLOYMENT_CHECKLIST.md`

---

**Last Updated:** January 20, 2026
