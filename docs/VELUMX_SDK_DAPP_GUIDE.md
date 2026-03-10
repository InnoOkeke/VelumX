# VelumX SDK - dApp Integration Guide

## Overview

The VelumX SDK enables any Stacks dApp to offer gasless transactions where users pay fees in USDCx instead of STX. This guide shows you how to integrate the SDK into your dApp.

## Quick Start

### 1. Install the SDK

```bash
npm install @velumx/sdk
```

### 2. Configure Environment

Add to your `.env.local`:

```bash
NEXT_PUBLIC_VELUMX_RELAYER_URL=https://sgal-relayer.onrender.com/api/v1
NEXT_PUBLIC_VELUMX_API_KEY=  # Optional
NEXT_PUBLIC_STACKS_NETWORK=testnet
```

### 3. Initialize the Client

```typescript
import { VelumXClient } from '@velumx/sdk';

const velumxClient = new VelumXClient({
  coreApiUrl: 'https://api.testnet.hiro.so',
  network: 'testnet',
  paymasterUrl: process.env.NEXT_PUBLIC_VELUMX_RELAYER_URL,
  apiKey: process.env.NEXT_PUBLIC_VELUMX_API_KEY
});
```

## Integration Patterns

### Pattern 1: Simple Gasless Transaction

```typescript
import { getGaslessService } from '@/lib/services/GaslessTransactionService';
import { tupleCV, Cl } from '@stacks/transactions';

async function executeMyGaslessTransaction() {
  const gaslessService = getGaslessService();
  
  // Build your transaction payload
  const payload = tupleCV({
    recipient: Cl.principal('ST...'),
    amount: Cl.uint('1000000'),
    memo: Cl.stringAscii('Payment')
  });
  
  // Execute gasless
  const result = await gaslessService.executeGasless({
    userAddress: currentUserAddress,
    targetContract: 'ST...CONTRACT.my-contract',
    payload,
    estimatedGas: 100000,
    onProgress: (step) => console.log(step)
  });
  
  console.log('Transaction ID:', result.txid);
}
```

### Pattern 2: Bridge Integration

```typescript
import { executeGaslessBridge } from '@/lib/helpers/gasless-bridge';

async function bridgeToEthereum() {
  const txid = await executeGaslessBridge({
    userAddress: stacksAddress,
    amount: '10.5',  // 10.5 USDCx
    recipientAddress: ethereumAddress,
    onProgress: (step) => setStatus(step)
  });
  
  console.log('Bridge transaction:', txid);
}
```

### Pattern 3: Swap Integration

```typescript
import { executeGaslessSwap } from '@/lib/helpers/gasless-swap';

async function swapTokens() {
  const txid = await executeGaslessSwap({
    userAddress: stacksAddress,
    inputToken: {
      symbol: 'USDCx',
      address: 'ST...usdcx',
      decimals: 6
    },
    outputToken: {
      symbol: 'VEX',
      address: 'ST...vex',
      decimals: 6
    },
    inputAmount: '100',
    minOutputAmount: '95',
    onProgress: (step) => setStatus(step)
  });
  
  console.log('Swap transaction:', txid);
}
```

## Core Concepts

### 1. Smart Wallet

Every user needs a Smart Wallet to use gasless transactions. The SDK automatically:
- Checks if user has a Smart Wallet
- Registers one if needed
- Waits for confirmation
- Proceeds with the transaction

### 2. Intent-Based Transactions

Gasless transactions use "intents" instead of direct contract calls:

```typescript
const intent = {
  target: 'ST...CONTRACT.function',  // Target contract
  payload: '0x...',                   // Serialized Clarity data
  maxFeeUSDCx: '250000',             // Max fee in microUSDCx
  nonce: 0                            // Smart Wallet nonce
};
```

### 3. SIP-018 Signing

Users sign intents using SIP-018 structured data signing:
- More secure than raw signatures
- Shows readable data in wallet
- Prevents replay attacks with nonces

### 4. Relayer Sponsorship

The relayer:
- Receives signed intents
- Validates signatures
- Sponsors transactions with STX
- Collects USDCx fees from users

## API Reference

### GaslessTransactionService

#### `executeGasless(params)`

Execute any gasless transaction.

**Parameters:**
```typescript
{
  userAddress: string;        // User's Stacks address
  targetContract: string;     // Contract to call
  payload: ClarityValue;      // Transaction data
  estimatedGas?: number;      // Gas estimate (default: 100000)
  onProgress?: (step) => void; // Progress callback
}
```

**Returns:**
```typescript
{
  txid: string;              // Transaction ID
  status: string;            // Transaction status
  smartWalletAddress: string; // User's Smart Wallet
}
```

#### `estimateFee(estimatedGas)`

Get fee estimate without executing.

**Parameters:**
- `estimatedGas: number` - Estimated gas in microSTX

**Returns:**
```typescript
{
  maxFeeUSDCx: string;  // Fee in microUSDCx
  estimatedGas: number;  // Gas estimate
}
```

#### `hasSmartWallet(userAddress)`

Check if user has a Smart Wallet.

**Returns:** `Promise<boolean>`

### VelumXClient (Low-Level)

#### `estimateFee(intent)`

```typescript
const estimate = await client.estimateFee({
  estimatedGas: 100000
});
// Returns: { maxFeeUSDCx: "250000", estimatedGas: 100000 }
```

#### `submitIntent(signedIntent)`

```typescript
const result = await client.submitIntent({
  target: 'ST...CONTRACT',
  payload: '0x...',
  maxFeeUSDCx: '250000',
  nonce: 0,
  signature: '0x...'
});
// Returns: { txid: '0x...', status: 'broadcasted' }
```

#### `submitRawTransaction(txHex)`

```typescript
const result = await client.submitRawTransaction('0x...');
// Returns: { txid: '0x...', status: 'broadcasted' }
```

## Example: Custom Contract Integration

Let's say you have a custom NFT minting contract and want to make it gasless:

### Step 1: Update Your Contract

Add a gasless minting function:

```clarity
;; my-nft-contract.clar

(define-public (mint-gasless (recipient principal) (token-id uint) (fee uint))
  (begin
    ;; Collect USDCx fee
    (try! (contract-call? .usdcx transfer fee tx-sender .paymaster-module none))
    
    ;; Mint NFT
    (try! (nft-mint? my-nft token-id recipient))
    
    (ok true)
  )
)
```

### Step 2: Create Helper Function

```typescript
// lib/helpers/gasless-nft-mint.ts

import { getGaslessService } from '@/lib/services/GaslessTransactionService';
import { tupleCV, Cl } from '@stacks/transactions';

export async function mintNFTGasless(
  userAddress: string,
  tokenId: number,
  onProgress?: (step: string) => void
): Promise<string> {
  const gaslessService = getGaslessService();
  
  // Get fee estimate
  const estimate = await gaslessService.estimateFee(80000);
  
  // Build payload
  const payload = tupleCV({
    recipient: Cl.principal(userAddress),
    tokenId: Cl.uint(tokenId),
    fee: Cl.uint(estimate.maxFeeUSDCx)
  });
  
  // Execute
  const result = await gaslessService.executeGasless({
    userAddress,
    targetContract: 'ST...YOUR-CONTRACT.my-nft-contract',
    payload,
    estimatedGas: 80000,
    onProgress
  });
  
  return result.txid;
}
```

### Step 3: Use in Your Component

```typescript
// components/MintButton.tsx

import { mintNFTGasless } from '@/lib/helpers/gasless-nft-mint';

function MintButton() {
  const [status, setStatus] = useState('');
  const [minting, setMinting] = useState(false);
  
  async function handleMint() {
    setMinting(true);
    try {
      const txid = await mintNFTGasless(
        userAddress,
        nextTokenId,
        (step) => setStatus(step)
      );
      
      setStatus(`Minted! TX: ${txid}`);
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setMinting(false);
    }
  }
  
  return (
    <div>
      <button onClick={handleMint} disabled={minting}>
        {minting ? 'Minting...' : 'Mint NFT (Pay in USDCx)'}
      </button>
      {status && <p>{status}</p>}
    </div>
  );
}
```

## Best Practices

### 1. Always Show Progress

```typescript
const [progress, setProgress] = useState('');

await gaslessService.executeGasless({
  // ...
  onProgress: (step) => {
    setProgress(step);
    console.log(step);
  }
});
```

### 2. Handle Errors Gracefully

```typescript
try {
  const result = await gaslessService.executeGasless(params);
} catch (error) {
  if (error.message.includes('cancelled')) {
    // User cancelled - don't show error
    console.log('User cancelled transaction');
  } else if (error.message.includes('Smart Wallet')) {
    // Smart Wallet issue
    setError('Please register your Smart Wallet first');
  } else {
    // Other errors
    setError(error.message);
  }
}
```

### 3. Show Fee Estimates

```typescript
const gaslessService = getGaslessService();
const estimate = await gaslessService.estimateFee(100000);
const feeInUsdcx = (Number(estimate.maxFeeUSDCx) / 1_000_000).toFixed(6);

console.log(`Gas fee: ${feeInUsdcx} USDCx`);
```

### 4. Check Smart Wallet Status

```typescript
const gaslessService = getGaslessService();
const hasWallet = await gaslessService.hasSmartWallet(userAddress);

if (!hasWallet) {
  // Show registration prompt
  setShowRegistrationPrompt(true);
}
```

## Troubleshooting

### Issue: "Smart Wallet not found"

**Solution:** The SDK will auto-register, but you can also manually trigger:

```typescript
import { registerSmartWallet } from '@/lib/registration';

const result = await registerSmartWallet(userAddress);
```

### Issue: "Insufficient USDCx balance"

**Solution:** Check user's USDCx balance before transaction:

```typescript
const estimate = await gaslessService.estimateFee(100000);
const requiredFee = BigInt(estimate.maxFeeUSDCx);

if (userUsdcxBalance < requiredFee) {
  throw new Error(`Need ${formatAmount(requiredFee)} USDCx for gas`);
}
```

### Issue: "Transaction timeout"

**Solution:** Increase timeout or check relayer status:

```typescript
// The SDK waits up to 60 seconds by default
// If needed, check transaction manually:
const response = await fetch(
  `https://api.testnet.hiro.so/extended/v1/tx/${txid}`
);
```

## Testing

### Test on Testnet First

```typescript
const velumxClient = new VelumXClient({
  coreApiUrl: 'https://api.testnet.hiro.so',
  network: 'testnet',
  paymasterUrl: 'https://sgal-relayer.onrender.com/api/v1'
});
```

### Get Testnet Tokens

1. Get testnet STX: https://explorer.hiro.so/sandbox/faucet
2. Get testnet USDCx: Bridge from Ethereum Sepolia

## Support

- **Documentation**: https://docs.velumx.com
- **GitHub**: https://github.com/velumx
- **Discord**: https://discord.gg/velumx

## License

MIT
