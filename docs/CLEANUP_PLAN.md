# Frontend Cleanup Plan

## Issues Identified

### 1. Old Paymaster Implementation
- `PaymasterService.ts` - Uses old intent-based approach
- API routes `/api/paymaster/*` - Redundant with simple-paymaster
- These were for the old Smart Wallet + SIP-018 approach

### 2. Transaction History Not Working
- Simple gasless helpers don't save transactions to database
- TransactionHistory component expects data from `/api/transactions/monitor`
- No transactions are being recorded

### 3. Unused Services
- `AttestationService.ts` - For Circle CCTP (not used in simple approach)
- `StacksMintService.ts` - For minting via attestations (not used)

## Cleanup Actions

### Phase 1: Remove Old Paymaster Code
1. Delete `frontend/lib/services/PaymasterService.ts`
2. Delete `frontend/app/api/paymaster/estimate/route.ts`
3. Delete `frontend/app/api/paymaster/sponsor/route.ts`
4. Delete `frontend/app/api/paymaster/broadcast/route.ts`
5. Delete `frontend/lib/sdk/index.ts` (old SDK wrapper)

### Phase 2: Fix Transaction History
1. Update `simple-gasless-bridge.ts` to save transactions
2. Update `simple-gasless-swap.ts` to save transactions
3. Simplify `TransactionMonitor.ts` for simple approach
4. Update transaction schema to match simple approach

### Phase 3: Remove Unused Services
1. Evaluate if `AttestationService.ts` is needed
2. Evaluate if `StacksMintService.ts` is needed
3. Keep only what's necessary for the simple approach

### Phase 4: Clean Up Config
1. Remove old paymaster config from `backend/config.ts`
2. Update environment variable documentation
3. Remove unused contract addresses

## Implementation Priority

1. **HIGH**: Fix transaction history (users need to see their activity)
2. **MEDIUM**: Remove old paymaster code (cleanup, reduce confusion)
3. **LOW**: Remove unused services (can keep for future features)

## Transaction History Fix

### Current Flow (Broken)
```
User bridges → Transaction completes → No record saved → History empty
```

### Fixed Flow
```
User bridges → Save to DB → Transaction completes → History shows activity
```

### Implementation
Add to `simple-gasless-bridge.ts` and `simple-gasless-swap.ts`:
```typescript
// After successful transaction
await fetch('/api/transactions/monitor', {
  method: 'POST',
  body: JSON.stringify({
    type: 'withdrawal', // or 'swap'
    sourceTxHash: txid,
    sourceChain: 'stacks',
    destinationChain: 'ethereum',
    amount: amount,
    sender: userAddress,
    recipient: recipientAddress,
    status: 'pending',
    timestamp: Date.now()
  })
});
```
