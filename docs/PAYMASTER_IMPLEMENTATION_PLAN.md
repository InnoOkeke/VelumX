# Paymaster Gasless Flow Implementation Plan

## Goal
Enable users to bridge and swap without needing STX, paying gas fees in USDCx automatically with a single click.

## Current Architecture

### Smart Contracts
- `paymaster-module-v10.clar`: Settles USDCx fees, calculates STX/USD rates
- `smart-wallet-v10.clar`: Executes gasless transactions with SIP-018 signatures
- `wallet-factory-v8.clar`: Deploys smart wallets per user
- `swap-v3.clar`: AMM with gasless swap functions

### Frontend Services
- `PaymasterService.ts`: Fee estimation via VelumX SDK
- `VelumXClient`: Intent submission to relayer
- Bridge/Swap interfaces: UI with partial gasless support

## Issues to Fix

### 1. Bridge Interface (Stacks → Ethereum)
**Current Flow:**
1. User enables gasless mode
2. System checks Smart Wallet balance
3. If insufficient, prompts user to transfer funds manually
4. User clicks bridge again after transfer completes
5. System creates intent and submits

**Problem:** Requires 2 clicks and waiting

**Solution:** Automatic fund consolidation
- Check Smart Wallet balance automatically
- If insufficient, batch transfer + bridge in single flow
- Use sequential transaction submission
- Show single progress indicator

### 2. Swap Interface
**Current Flow:**
1. User enables gasless mode
2. Complex post-condition logic for combined USDCx amounts
3. Manual Smart Wallet registration if not exists
4. SIP-018 signing and intent submission

**Problem:** Complex, error-prone post-conditions

**Solution:** Simplify post-conditions
- Use separate post-conditions for swap amount and fee
- Let paymaster contract handle fee validation
- Auto-register Smart Wallet on first use

### 3. Smart Wallet Registration
**Current:** Manual button click required

**Solution:** Auto-register on first gasless transaction
- Check if Smart Wallet exists
- If not, trigger registration automatically
- Wait for confirmation before proceeding
- Cache registration status

## Implementation Steps

### Step 1: Create Automatic Smart Wallet Manager
```typescript
// lib/services/SmartWalletManager.ts
class SmartWalletManager {
  async ensureSmartWallet(userAddress: string): Promise<string>
  async getOrCreateSmartWallet(userAddress: string): Promise<string>
  async checkRegistrationStatus(userAddress: string): Promise<boolean>
}
```

### Step 2: Create Fund Consolidation Service
```typescript
// lib/services/FundConsolidator.ts
class FundConsolidator {
  async ensureFunds(
    userAddress: string,
    smartWalletAddress: string,
    requiredAmount: bigint,
    feeAmount: bigint
  ): Promise<void>
}
```

### Step 3: Update Bridge Interface
- Remove manual transfer logic
- Add automatic fund consolidation before bridge
- Single-click bridge with progress states:
  1. "Checking Smart Wallet..."
  2. "Consolidating funds..." (if needed)
  3. "Signing transaction..."
  4. "Broadcasting..."
  5. "Complete!"

### Step 4: Update Swap Interface
- Simplify post-condition logic
- Add automatic Smart Wallet check
- Single-click swap with same progress states

### Step 5: Update Paymaster Service
- Add balance checking utilities
- Add automatic fee calculation
- Add transaction batching support

## Technical Details

### Automatic Fund Consolidation
```typescript
async function consolidateFunds(
  userAddress: string,
  smartWalletAddress: string,
  swapAmount: bigint,
  feeAmount: bigint
): Promise<void> {
  const totalNeeded = swapAmount + feeAmount;
  const swBalance = await getSmartWalletBalance(smartWalletAddress);
  
  if (swBalance >= totalNeeded) {
    return; // Already has enough
  }
  
  const transferAmount = totalNeeded - swBalance;
  const personalBalance = await getPersonalBalance(userAddress);
  
  if (personalBalance < transferAmount) {
    throw new Error(`Insufficient USDCx. Need ${formatAmount(transferAmount)} more.`);
  }
  
  // Execute transfer
  await transferToSmartWallet(userAddress, smartWalletAddress, transferAmount);
  
  // Wait for confirmation
  await waitForTransactionConfirmation();
}
```

### Simplified Post-Conditions
```typescript
// Instead of combining USDCx amounts, use separate conditions
const postConditions = [
  // User sends swap amount
  Pc.principal(userAddress)
    .willSendEq(swapAmount)
    .ft(inputToken.address, inputToken.assetName),
  
  // User sends fee (separate condition)
  Pc.principal(userAddress)
    .willSendEq(feeAmount)
    .ft(usdcxAddress, 'usdcx'),
  
  // Contract sends output
  Pc.principal(swapContract)
    .willSendGte(minAmountOut)
    .ft(outputToken.address, outputToken.assetName)
];
```

### Auto-Registration Flow
```typescript
async function ensureSmartWalletRegistered(userAddress: string): Promise<string> {
  // Check if already registered
  let smartWallet = await getSmartWalletAddress(userAddress);
  
  if (smartWallet) {
    return smartWallet;
  }
  
  // Auto-register
  console.log('No Smart Wallet found. Registering automatically...');
  const result = await registerSmartWallet(userAddress);
  
  if (!result) {
    throw new Error('Smart Wallet registration failed or was cancelled');
  }
  
  // Wait for confirmation
  await waitForTransactionConfirmation(result.txid);
  
  // Fetch the new address
  smartWallet = await getSmartWalletAddress(userAddress);
  
  if (!smartWallet) {
    throw new Error('Smart Wallet registration completed but address not found');
  }
  
  return smartWallet;
}
```

## User Experience Flow

### Bridge (Stacks → Ethereum) - Gasless
1. User enters amount and clicks "Bridge"
2. System automatically:
   - Checks/creates Smart Wallet (if first time)
   - Checks Smart Wallet balance
   - Transfers funds from personal wallet if needed
   - Creates withdrawal intent
   - Prompts for SIP-018 signature
   - Submits to relayer
3. User sees: "Bridge successful! Funds will arrive in ~15 minutes"

### Swap - Gasless
1. User selects tokens, enters amount, clicks "Swap"
2. System automatically:
   - Checks/creates Smart Wallet (if first time)
   - Calculates fee in USDCx
   - Creates swap intent with fee
   - Prompts for SIP-018 signature
   - Submits to relayer
3. User sees: "Swap successful! You will receive ~X tokens"

## Benefits
- ✅ Single-click operations
- ✅ No manual Smart Wallet management
- ✅ No manual fund transfers
- ✅ Clear progress indicators
- ✅ Users pay gas in USDCx automatically
- ✅ No STX required

## Next Steps
1. Implement SmartWalletManager service
2. Implement FundConsolidator service
3. Update BridgeInterface component
4. Update SwapInterface component
5. Add comprehensive error handling
6. Add transaction status tracking
7. Test end-to-end flows
