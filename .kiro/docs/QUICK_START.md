# Quick Start Guide - VelumX Bridge

## Prerequisites

- Node.js 18+ installed
- Ethereum wallet (Rabby or MetaMask)
- Stacks wallet (Xverse, Leather, or Hiro)
- Testnet tokens:
  - ETH (Sepolia): https://sepoliafaucet.com
  - USDC (Sepolia): https://faucet.circle.com
  - STX (Testnet): https://explorer.hiro.so/sandbox/faucet?chain=testnet

## Installation

```bash
# Clone the repository (if not already done)
cd VelumX

# Install dependencies
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
cd shared && npm install && cd ..
```

## Configuration

### 1. Backend Configuration

The backend is already configured with the deployed paymaster contract:

```bash
# backend/.env is already set up with:
STACKS_PAYMASTER_ADDRESS=STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.paymaster-v3
RELAYER_PRIVATE_KEY=your_private_key_here
RELAYER_STACKS_ADDRESS=your_stacks_address_here
```

**Optional:** Add your Ethereum RPC URL for better performance:
```bash
# Edit backend/.env
ETHEREUM_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
```

### 2. Frontend Configuration

The frontend is already configured:

```bash
# frontend/.env.local is already set up with:
NEXT_PUBLIC_STACKS_PAYMASTER_ADDRESS=STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.paymaster-v3
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

### 3. Fund Relayer (IMPORTANT!)

The relayer needs STX to sponsor gasless transactions:

```bash
# Get testnet STX for the relayer address
# Visit: https://explorer.hiro.so/sandbox/faucet?chain=testnet
# Enter address: STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P
# Request 10+ STX
```

## Running the Application

### Terminal 1: Start Backend

```bash
cd backend
npm run dev
```

Expected output:
```
Server running on port 3001
Services initialized successfully
Relayer address: STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P
```

### Terminal 2: Start Frontend

```bash
cd frontend
npm run dev
```

Expected output:
```
▲ Next.js 16.1.3
- Local: http://localhost:3000
```

## Using the Bridge

### 1. Open the Application

Navigate to: http://localhost:3000

### 2. Connect Wallets

- Click "Connect Ethereum Wallet" → Select Rabby or MetaMask
- Click "Connect Stacks Wallet" → Select Xverse, Leather, or Hiro
- Verify balances display correctly

### 3. Bridge USDC from Ethereum to Stacks

1. Ensure direction is "Ethereum → Stacks"
2. Enter amount (e.g., 1 USDC)
3. Click "Bridge USDC"
4. Approve USDC spending in wallet
5. Confirm deposit transaction
6. Monitor status in "History" tab

**Expected time:** 5-10 minutes

### 4. Bridge USDCx from Stacks to Ethereum (Regular)

1. Click direction switcher to "Stacks → Ethereum"
2. Enter amount
3. Keep "Gasless Mode" OFF
4. Click "Bridge USDCx"
5. Confirm transaction in Stacks wallet
6. Pay STX gas fee (~0.1 STX)

**Expected time:** 5-10 minutes

### 5. Bridge USDCx from Stacks to Ethereum (Gasless) ⚡

1. Click direction switcher to "Stacks → Ethereum"
2. Enter amount
3. Enable "Gasless Mode" toggle
4. Review fee estimate in USDCx
5. Click "Bridge USDCx"
6. Confirm transaction in Stacks wallet
7. **No STX needed!** Fee paid in USDCx

**Expected time:** 5-10 minutes

## Features

### ✅ Implemented

- **Dual Wallet Support:** Ethereum (Rabby/MetaMask) + Stacks (Xverse/Leather/Hiro)
- **Bidirectional Bridge:** Ethereum ↔ Stacks
- **Gasless Transactions:** Pay fees in USDCx instead of STX
- **Real-time Monitoring:** Track transaction status
- **Transaction History:** View all past transactions
- **Balance Display:** See USDC, USDCx, ETH, STX balances
- **Fee Estimation:** Know costs before submitting
- **Notifications:** Success/error messages
- **Explorer Links:** View transactions on block explorers

### 🚧 Coming Soon

- Yield farming integration
- Multi-protocol support
- Advanced analytics
- Mobile optimization

## Troubleshooting

### Backend won't start

**Error:** "Missing required environment variables"
**Solution:** Verify `backend/.env` has all required variables

**Error:** "Port 3001 already in use"
**Solution:** Kill existing process or change PORT in `.env`

### Frontend won't start

**Error:** "Module not found"
**Solution:** Run `npm install` in frontend directory

**Error:** "Port 3000 already in use"
**Solution:** Kill existing process or use different port

### Wallet won't connect

**Error:** "MetaMask not installed"
**Solution:** Install MetaMask or Rabby browser extension

**Error:** "Wrong network"
**Solution:** Switch to Sepolia in Ethereum wallet

### Transaction fails

**Error:** "Insufficient balance"
**Solution:** Get testnet tokens from faucets

**Error:** "Relayer balance too low"
**Solution:** Fund relayer with more STX

**Error:** "User rejected transaction"
**Solution:** Confirm transaction in wallet

### Gasless mode not working

**Error:** "Relayer balance too low"
**Solution:** Fund relayer address with 10+ STX

**Error:** "Insufficient USDCx balance"
**Solution:** Bridge USDC from Ethereum first

**Error:** "Contract not found"
**Solution:** Wait for contract confirmation (10-20 min)

## Monitoring

### Check Backend Health

```bash
curl http://localhost:3001/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": 1737369600000,
  "services": {
    "attestation": "operational",
    "monitoring": "operational",
    "paymaster": "operational"
  }
}
```

### Check Relayer Balance

```bash
curl https://api.testnet.hiro.so/extended/v1/address/STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P/balances
```

### View Backend Logs

```bash
cd backend
tail -f logs/combined.log
```

### View Transaction on Explorer

**Ethereum:** https://sepolia.etherscan.io/tx/TX_HASH  
**Stacks:** https://explorer.hiro.so/txid/TX_HASH?chain=testnet

## Testing Checklist

- [ ] Backend starts without errors
- [ ] Frontend loads at http://localhost:3000
- [ ] Can connect Ethereum wallet
- [ ] Can connect Stacks wallet
- [ ] Balances display correctly
- [ ] Can bridge USDC → USDCx
- [ ] Can bridge USDCx → USDC (regular)
- [ ] Can bridge USDCx → USDC (gasless)
- [ ] Transaction history displays
- [ ] Notifications work
- [ ] Explorer links work

## Support

For issues or questions:
1. Check this guide
2. Review `PAYMASTER_INTEGRATION.md`
3. Check `DEPLOYMENT_CHECKLIST.md`
4. Review backend logs
5. Check transaction on explorer

## Next Steps

1. ✅ Deploy paymaster contract
2. ✅ Configure backend and frontend
3. ✅ Fund relayer address
4. 🔄 Test all features
5. 📊 Monitor relayer balance
6. 🚀 Deploy to production (mainnet)

---

**Status:** Ready for Testing  
**Last Updated:** January 20, 2026  
**Version:** 1.0.0-testnet
