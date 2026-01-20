# Paymaster Contract Integration Guide

## Deployment Summary

**Contract Address:** `STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.paymaster-v3`  
**Transaction ID:** `b51c675e0705a182b8e8949b36553d90b2479ffb91c10bc669e156c9a9d7738a`  
**Explorer:** https://explorer.hiro.so/txid/b51c675e0705a182b8e8949b36553d90b2479ffb91c10bc669e156c9a9d7738a?chain=testnet  
**Network:** Stacks Testnet  
**Deployment Date:** January 20, 2026

## Contract Functions

### 1. `pay-fee-in-usdc`
Standard fee settlement for any SIP-010 token.

**Parameters:**
- `usdc` (trait): SIP-010 token contract
- `amount` (uint): Fee amount in micro tokens

**Usage:** Generic fee payment function for sponsored transactions.

### 2. `withdraw-gasless`
Gasless bridge withdrawal from Stacks to Ethereum.

**Parameters:**
- `amount` (uint): Amount to withdraw in micro USDCx
- `fee` (uint): Fee to pay relayer in micro USDCx
- `recipient` (buff 32): Ethereum address as 32-byte buffer

**Flow:**
1. User pays fee in USDCx to relayer
2. Contract calls USDCx protocol burn function
3. Transaction is sponsored by relayer (no STX needed from user)

## Backend Integration

### Configuration (backend/.env)

```env
STACKS_PAYMASTER_ADDRESS=STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.paymaster-v3
RELAYER_PRIVATE_KEY=your_private_key_here
RELAYER_STACKS_ADDRESS=your_stacks_address_here
MIN_STX_BALANCE=10000000
PAYMASTER_MARKUP=5
```

### PaymasterService

**Location:** `backend/src/services/PaymasterService.ts`

**Key Methods:**
- `getExchangeRates()`: Fetches STX/USD and USDC/USD rates
- `estimateFee(estimatedGasInStx)`: Calculates fee in both STX and USDCx
- `sponsorTransaction(userTx, userAddress, estimatedFee)`: Sponsors transaction with relayer key
- `validateUserBalance(userAddress, requiredFee)`: Checks user has sufficient USDCx
- `checkRelayerBalance()`: Ensures relayer has enough STX to sponsor

**API Endpoints:**
- `POST /api/paymaster/estimate` - Get fee estimate
- `POST /api/paymaster/sponsor` - Submit sponsored transaction
- `GET /api/paymaster/rates` - Get current exchange rates

## Frontend Integration

### Configuration (frontend/.env.local)

```env
NEXT_PUBLIC_STACKS_PAYMASTER_ADDRESS=STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.paymaster-v3
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

### BridgeInterface Component

**Location:** `frontend/components/BridgeInterface.tsx`

**Gasless Mode Features:**
1. Toggle switch for enabling gasless transactions
2. Real-time fee estimation in USDCx
3. Automatic contract selection (paymaster vs protocol)
4. Sponsored transaction submission

**User Flow:**
1. User enters withdrawal amount
2. User enables "Gasless Mode" toggle
3. Frontend fetches fee estimate from backend
4. User confirms transaction (pays fee in USDCx, no STX needed)
5. Transaction is sponsored by relayer
6. User receives USDC on Ethereum

### Code Changes

**Contract Selection:**
```typescript
const contractAddress = state.gaslessMode 
  ? config.stacksPaymasterAddress.split('.')[0]
  : config.stacksUsdcxProtocolAddress.split('.')[0];

const contractName = state.gaslessMode
  ? config.stacksPaymasterAddress.split('.')[1]
  : config.stacksUsdcxProtocolAddress.split('.')[1];

const functionName = state.gaslessMode ? 'withdraw-gasless' : 'burn';
```

**Function Arguments:**
```typescript
const functionArgs = state.gaslessMode
  ? [
      uintCV(Number(amountInMicroUsdc)),
      uintCV(Number(parseUnits(state.feeEstimate?.usdcx || '0', 6))),
      bufferCV(recipientBytes),
    ]
  : [
      uintCV(Number(amountInMicroUsdc)),
      uintCV(0), // native-domain: 0 for Ethereum
      bufferCV(recipientBytes),
    ];
```

## Testing Checklist

### Prerequisites
- [ ] Relayer address funded with 10+ STX
- [ ] User has USDCx balance on Stacks
- [ ] Backend server running
- [ ] Frontend server running

### Test Steps

1. **Connect Wallets**
   - [ ] Connect Ethereum wallet (Rabby/MetaMask)
   - [ ] Connect Stacks wallet (Xverse/Leather/Hiro)
   - [ ] Verify balances display correctly

2. **Test Regular Withdrawal (with STX)**
   - [ ] Switch to Stacks → Ethereum direction
   - [ ] Enter withdrawal amount
   - [ ] Keep gasless mode OFF
   - [ ] Submit transaction
   - [ ] Verify user pays STX gas fee
   - [ ] Monitor transaction status

3. **Test Gasless Withdrawal**
   - [ ] Switch to Stacks → Ethereum direction
   - [ ] Enter withdrawal amount
   - [ ] Enable gasless mode toggle
   - [ ] Verify fee estimate displays in USDCx
   - [ ] Submit transaction
   - [ ] Verify user pays ONLY USDCx fee (no STX)
   - [ ] Monitor transaction status
   - [ ] Verify relayer STX balance decreases
   - [ ] Verify user USDCx balance decreases by (amount + fee)

4. **Test Edge Cases**
   - [ ] Insufficient USDCx balance
   - [ ] Relayer balance too low
   - [ ] Network errors
   - [ ] User cancels transaction

### Expected Results

**Regular Withdrawal:**
- User pays ~0.1 STX gas fee
- User USDCx balance decreases by withdrawal amount
- Transaction completes successfully

**Gasless Withdrawal:**
- User pays 0 STX (no STX balance needed)
- User USDCx balance decreases by (amount + fee)
- Relayer STX balance decreases by ~0.05 STX
- Transaction completes successfully

## Monitoring

### Check Relayer Balance

```bash
curl https://api.testnet.hiro.so/extended/v1/address/STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P/balances
```

### Check Contract Status

```bash
curl https://api.testnet.hiro.so/v2/contracts/interface/STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P/paymaster-v3
```

### Backend Logs

```bash
cd backend
tail -f logs/combined.log | grep paymaster
```

## Troubleshooting

### "Relayer balance too low"
**Solution:** Fund relayer with more STX from faucet: https://explorer.hiro.so/sandbox/faucet?chain=testnet

### "User has insufficient USDCx balance"
**Solution:** Bridge more USDC from Ethereum first

### "Contract not found"
**Solution:** Wait for deployment confirmation (10-20 minutes) or verify contract address

### "Transaction failed"
**Solution:** Check backend logs for detailed error, verify contract is deployed and confirmed

## Security Notes

- Relayer private key is stored in backend .env (never commit to git)
- Paymaster contract validates sponsor is the configured relayer
- User must have sufficient USDCx to pay fee
- Fee includes configurable markup (default 5%)
- Relayer balance is monitored and alerts when low

## Next Steps

1. Fund relayer address with 10+ STX
2. Test gasless withdrawals with small amounts
3. Monitor relayer balance and refill as needed
4. Adjust markup percentage based on costs
5. Set up automated relayer funding for production

---

**Status:** ✅ Deployed and Integrated  
**Ready for Testing:** Yes  
**Production Ready:** No (testnet only)
