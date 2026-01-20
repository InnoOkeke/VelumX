# Gasless Transactions Setup Guide

This guide will help you deploy the paymaster contract and configure the backend to sponsor gasless transactions.

## Overview

The gasless transaction feature allows users to pay gas fees in USDCx instead of STX, removing friction for new users who don't have STX tokens.

**How it works:**
1. User initiates a transaction (e.g., bridge withdrawal)
2. User signs the transaction with `sponsored: true` flag
3. Backend relayer sponsors the transaction (pays STX gas)
4. Paymaster contract deducts USDCx fee from user's balance
5. Transaction executes without user needing STX

## Step 1: Deploy Paymaster Contract

### 1.1 Install Dependencies

```bash
cd stacks-contracts
npm install
```

### 1.2 Get Testnet STX

1. Install Leather or Hiro wallet
2. Switch to testnet mode
3. Visit: https://explorer.hiro.so/sandbox/faucet?chain=testnet
4. Request testnet STX (you'll need ~1 STX for deployment)

### 1.3 Deploy Contract

```bash
# Set your private key
export STACKS_PRIVATE_KEY="your_private_key_here"

# Deploy
npm run deploy
```

**Output:**
```
✅ Contract deployed successfully!
📋 Transaction ID: 0x...
📍 Contract Address: ST1ABC...XYZ.paymaster-v3
```

### 1.4 Wait for Confirmation

- Check transaction status: https://explorer.hiro.so/txid/YOUR_TX_ID?chain=testnet
- Wait 10-20 minutes for confirmation
- Once confirmed, the contract is live!

## Step 2: Configure Backend

### 2.1 Update Environment Variables

Create/update `backend/.env`:

```bash
# Paymaster Configuration
STACKS_PAYMASTER_ADDRESS=YOUR_ADDRESS.paymaster-v3
STACKS_RELAYER_PRIVATE_KEY=your_relayer_private_key
STACKS_RELAYER_ADDRESS=your_relayer_address

# Minimum STX balance for relayer (in microSTX)
MIN_STX_BALANCE=10000000  # 10 STX

# Paymaster markup percentage
PAYMASTER_MARKUP=5  # 5% markup on gas fees
```

### 2.2 Fund the Relayer

The relayer address needs STX to sponsor transactions:

```bash
# Get testnet STX for relayer
# Visit: https://explorer.hiro.so/sandbox/faucet?chain=testnet
# Send to: YOUR_RELAYER_ADDRESS

# Recommended: Keep at least 10 STX in relayer wallet
```

### 2.3 Verify Configuration

```bash
cd backend
npm run build
npm start
```

Check logs for:
```
✓ Configuration loaded successfully
✓ Services initialized successfully
```

## Step 3: Configure Frontend

### 3.1 Update Environment Variables

Create/update `frontend/.env.local`:

```bash
# Paymaster Configuration
NEXT_PUBLIC_STACKS_PAYMASTER_ADDRESS=YOUR_ADDRESS.paymaster-v3
```

### 3.2 Build Frontend

```bash
cd frontend
npm run build
```

## Step 4: Test Gasless Transactions

### 4.1 Connect Wallets

1. Start the frontend: `npm run dev`
2. Connect Ethereum wallet (Rabby/MetaMask)
3. Connect Stacks wallet (Xverse/Leather/Hiro)

### 4.2 Test Withdrawal with Gasless Mode

1. Bridge some USDC from Ethereum to Stacks first
2. Go to Bridge interface
3. Select "Stacks → Ethereum" direction
4. Enable "Gasless Mode" toggle
5. Enter amount and submit
6. Sign transaction in wallet (no STX needed!)
7. Backend sponsors the transaction
8. Monitor transaction status

### 4.3 Verify Transaction

Check the transaction on explorer:
- Should show `sponsored: true`
- Sponsor address should be your relayer
- User paid fee in USDCx, not STX

## Monitoring

### Check Relayer Balance

```bash
# Query Stacks API
curl https://api.testnet.hiro.so/extended/v1/address/YOUR_RELAYER_ADDRESS/balances
```

### Monitor Backend Logs

```bash
cd backend
npm start

# Watch for:
# - "Sponsoring transaction" logs
# - "Relayer balance check" logs
# - Any "balance too low" errors
```

### Set Up Alerts

The backend will log errors when relayer balance is low. In production, you should:

1. Set up monitoring (e.g., Datadog, New Relic)
2. Configure alerts for low balance
3. Automate relayer funding
4. Monitor transaction success rates

## Troubleshooting

### "Relayer balance too low"

**Solution:** Fund the relayer address with more STX

```bash
# Get testnet STX
https://explorer.hiro.so/sandbox/faucet?chain=testnet
```

### "User has insufficient USDCx balance"

**Solution:** User needs to bridge USDC from Ethereum first

### "Contract not found"

**Solution:** 
1. Verify contract deployment was successful
2. Check contract address in config matches deployed address
3. Wait for deployment transaction to confirm

### "Transaction sponsoring failed"

**Possible causes:**
1. Relayer private key incorrect
2. Relayer out of STX
3. Network issues
4. Contract address incorrect

**Debug steps:**
1. Check backend logs for detailed error
2. Verify relayer balance
3. Test relayer key with simple transaction
4. Check Stacks testnet status

## Security Best Practices

### Production Deployment

1. **Never commit private keys**
   - Use environment variables
   - Use secrets management (AWS Secrets Manager, HashiCorp Vault)

2. **Rotate relayer keys regularly**
   - Generate new key pair
   - Update configuration
   - Transfer remaining STX to new address

3. **Monitor relayer balance**
   - Set up automated alerts
   - Implement auto-funding mechanism
   - Keep backup funds ready

4. **Rate limiting**
   - Already implemented in backend (10 req/min for sponsor endpoint)
   - Monitor for abuse
   - Implement additional fraud detection

5. **Fee validation**
   - Backend validates user has sufficient USDCx
   - Paymaster contract enforces fee payment
   - Monitor for unusual fee patterns

## Cost Analysis

### Per Transaction Costs

**Relayer (STX gas):**
- ~0.05 STX per transaction
- At $0.50/STX = $0.025 per transaction

**User (USDCx fee):**
- Gas cost + 5% markup
- ~$0.026 per transaction

**Monthly costs (1000 transactions):**
- Relayer: ~50 STX = $25
- Revenue (5% markup): ~$1.25
- Net cost: ~$23.75/month

### Optimization Tips

1. Batch transactions when possible
2. Adjust markup based on STX price volatility
3. Implement dynamic fee calculation
4. Monitor and optimize gas usage

## Next Steps

1. ✅ Deploy paymaster contract
2. ✅ Configure backend with relayer key
3. ✅ Fund relayer address
4. ✅ Test gasless transactions
5. 🔄 Monitor relayer balance
6. 🔄 Set up production monitoring
7. 🔄 Implement automated funding
8. 🔄 Deploy to mainnet (when ready)

## Support

For issues or questions:
- Check backend logs: `backend/logs/`
- Review transaction on explorer
- Verify configuration matches deployment
- Test with small amounts first

---

**Remember:** This is testnet. Always test thoroughly before mainnet deployment!
