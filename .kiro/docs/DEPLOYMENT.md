# Paymaster Contract Deployment Guide

## Prerequisites

1. **Get a Stacks Testnet Wallet**
   - Install Leather or Hiro wallet
   - Switch to testnet mode
   - Copy your private key (Settings → Show Secret Key)

2. **Get Testnet STX**
   - Visit: https://explorer.hiro.so/sandbox/faucet?chain=testnet
   - Request testnet STX (you'll need ~1 STX for deployment)

## Deployment Steps

### 1. Install Dependencies

```bash
cd stacks-contracts
npm install
```

### 2. Set Your Private Key

**Option A: Environment Variable (Recommended)**
```bash
# Windows CMD
set STACKS_PRIVATE_KEY=your_private_key_here

# Windows PowerShell
$env:STACKS_PRIVATE_KEY="your_private_key_here"

# Linux/Mac
export STACKS_PRIVATE_KEY=your_private_key_here
```

**Option B: .env File**
Create a `.env` file in the `stacks-contracts` directory:
```
STACKS_PRIVATE_KEY=your_private_key_here
```

### 3. Deploy the Contract

```bash
npm run deploy
```

### 4. Wait for Confirmation

The deployment will:
- Create and broadcast the transaction
- Output the transaction ID and contract address
- Save deployment info to `deployment-info.json`

**Important:** Wait 10-20 minutes for the transaction to confirm on testnet.

### 5. Verify Deployment

Check the transaction status:
```
https://explorer.hiro.so/txid/YOUR_TX_ID?chain=testnet
```

Once confirmed, you'll see the contract at:
```
https://explorer.hiro.so/address/YOUR_ADDRESS.paymaster-v3?chain=testnet
```

## Post-Deployment

### Update Configuration

1. **Backend Config** (`backend/src/config/index.ts`):
```typescript
stacksPaymasterAddress: process.env.STACKS_PAYMASTER_ADDRESS || 'YOUR_ADDRESS.paymaster-v3'
```

2. **Frontend Config** (`frontend/lib/config.ts`):
```typescript
stacksPaymasterAddress: process.env.NEXT_PUBLIC_STACKS_PAYMASTER_ADDRESS || 'YOUR_ADDRESS.paymaster-v3'
```

3. **Environment Variables**:
```bash
# Backend .env
STACKS_PAYMASTER_ADDRESS=YOUR_ADDRESS.paymaster-v3
STACKS_RELAYER_PRIVATE_KEY=your_relayer_private_key

# Frontend .env.local
NEXT_PUBLIC_STACKS_PAYMASTER_ADDRESS=YOUR_ADDRESS.paymaster-v3
```

### Fund the Relayer

The relayer address needs STX to sponsor transactions:

1. Get the relayer address from your backend config
2. Send testnet STX to the relayer address
3. Recommended: Keep at least 10 STX in the relayer wallet

## Troubleshooting

### "STACKS_PRIVATE_KEY not set"
- Make sure you've set the environment variable
- Check for typos in the variable name
- Try restarting your terminal

### "Insufficient balance"
- Get more testnet STX from the faucet
- Wait a few minutes for the faucet transaction to confirm

### "Contract already exists"
- The contract name is already taken
- Change the contract name in `deploy-paymaster.js` (line 44)
- Or use a different deployer address

### Transaction Stuck
- Testnet can be slow (10-20 minutes is normal)
- Check the explorer link for status
- If stuck for >1 hour, try redeploying with a higher fee

## Contract Functions

### `pay-fee-in-usdc`
Pay gas fees in USDC instead of STX
```clarity
(contract-call? .paymaster-v3 pay-fee-in-usdc usdc-contract amount)
```

### `withdraw-gasless`
Withdraw from bridge without paying STX gas
```clarity
(contract-call? .paymaster-v3 withdraw-gasless amount fee recipient)
```

## Security Notes

- **Never commit private keys** to version control
- Use `.gitignore` to exclude `.env` files
- Keep relayer wallet funded but not over-funded
- Monitor relayer balance regularly
- Rotate relayer keys periodically in production
