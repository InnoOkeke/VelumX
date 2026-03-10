# Simple Paymaster Migration Guide

## Overview

We've migrated from the complex Smart Wallet + SIP-018 approach to a simpler Stacks-native sponsored transaction approach using `simple-paymaster-v1`.

## What Changed

### Old Approach (Complex)
- User registers a Smart Wallet contract
- User transfers funds to Smart Wallet
- User signs SIP-018 structured data
- Relayer calls Smart Wallet's `execute-gasless` function
- Smart Wallet verifies signature and executes

**Problems:**
- Complex multi-step process
- Requires Smart Wallet registration
- Requires fund consolidation
- SIP-018 signing complexity
- Multiple transactions needed

### New Approach (Simple)
- User calls paymaster contract directly with `sponsored=true`
- Wallet creates sponsored transaction
- Relayer signs as sponsor
- Single transaction, no Smart Wallet needed

**Benefits:**
- ✅ Single transaction
- ✅ No Smart Wallet registration
- ✅ No fund consolidation
- ✅ Native Stacks sponsorship
- ✅ Simpler code
- ✅ Better UX

## Contracts Deployed

### simple-paymaster-v1
**Address**: `STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.simple-paymaster-v1`

**Functions:**
- `bridge-gasless` - Gasless bridge withdrawal
- `swap-gasless` - Gasless token swap

## SDK Published

**Package**: `@velumx/sdk@2.0.0`
**NPM**: https://www.npmjs.com/package/@velumx/sdk

Install:
```bash
npm install @velumx/sdk
```

## Frontend Changes

### Environment Variables
```env
# New
NEXT_PUBLIC_STACKS_PAYMASTER_ADDRESS=STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.simple-paymaster-v1

# Removed (no longer needed)
# NEXT_PUBLIC_STACKS_SMART_WALLET_ADDRESS
# NEXT_PUBLIC_STACKS_WALLET_FACTORY_ADDRESS
```

### New Helper
`frontend/lib/helpers/simple-gasless-bridge.ts`
- Simplified gasless bridge implementation
- Uses Stacks-native `sponsored=true`
- No Smart Wallet, no SIP-018 signing

### Updated Components
- `BridgeInterface.tsx` - Now uses `executeSimpleGaslessBridge()`

## User Flow

### Bridge (Stacks → Ethereum) - Gasless

1. User enters amount and clicks "Bridge"
2. User approves transaction in wallet (sponsored=true)
3. Wallet creates sponsored transaction with `txRaw`
4. Frontend sends `txRaw` to relayer
5. Relayer signs as sponsor and broadcasts
6. Done! Single transaction.

**No more:**
- ❌ Smart Wallet registration
- ❌ Fund consolidation
- ❌ Transfer confirmation waiting
- ❌ SIP-018 signing
- ❌ Multiple transactions

## Relayer

The relayer already supports this via the `/api/v1/broadcast` endpoint which calls `sponsorRawTransaction()`.

No relayer changes needed!

## Testing

1. Start frontend: `cd frontend && npm run dev`
2. Connect wallet
3. Try bridging with gasless mode enabled
4. Should see single transaction prompt
5. Relayer sponsors and broadcasts

## Migration Checklist

- [x] Deploy simple-paymaster-v1 contract
- [x] Publish @velumx/sdk@2.0.0 to npm
- [x] Update frontend .env with new paymaster address
- [x] Create simple-gasless-bridge.ts helper
- [x] Update BridgeInterface to use new helper
- [x] Build and test frontend
- [ ] Test end-to-end bridge transaction
- [ ] Create simple-gasless-swap.ts helper
- [ ] Update SwapInterface to use new helper
- [ ] Deploy to production

## Next Steps

1. Test the bridge with real transactions
2. Create similar helper for swaps
3. Update documentation
4. Deploy to production

## Rollback Plan

If issues arise, we can:
1. Revert .env to use old paymaster
2. Revert BridgeInterface to use old helper
3. Rebuild and redeploy

The old code is still in the repo for reference.

---

**Status**: ✅ Ready for testing
**Build**: ✅ Passing
**SDK**: ✅ Published to npm
