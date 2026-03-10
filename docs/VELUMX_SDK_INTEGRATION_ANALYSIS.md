# VelumX SDK Integration Analysis & Implementation Guide

## Current Status: ✅ SDK Properly Installed

### Installation Verification
- **Package**: `@velumx/sdk@1.4.0` ✅ Installed in frontend
- **Location**: `velumx/sdk/` (local package)
- **Built**: ✅ TypeScript compiled to `dist/`
- **Imported**: ✅ Used in `frontend/lib/velumx.ts`

### SDK Architecture

```
@velumx/sdk
├── VelumXClient (Main API)
│   ├── estimateFee()      - Get gas fee estimate in USDCx
│   ├── submitIntent()     - Submit signed intent to relayer
│   └── submitRawTransaction() - Submit raw Stacks tx hex
├── IntentBuilder (Helper)
│   ├── signIntent()       - Sign intent with private key
│   └── getDomain()        - SIP-018 domain for signing
└── Types
    ├── WalletIntent       - Unsigned intent structure
    ├── SignedIntent       - Signed intent with signature
    └── NetworkConfig      - SDK configuration
```

## Current Integration Issues

### 1. ❌ Missing Environment Variables
The SDK needs the relayer URL but it's not in `.env.local.example`:

```bash
# Missing from .env.local.example:
NEXT_PUBLIC_VELUMX_RELAYER_URL=https://sgal-relayer.onrender.com/api/v1
NEXT_PUBLIC_VELUMX_API_KEY=your_api_key_here  # Optional
```

### 2. ⚠️ Hardcoded Relayer URL
In `frontend/lib/velumx.ts`:
```typescript
const paymasterUrl = process.env.NEXT_PUBLIC_VELUMX_RELAYER_URL || 
  'https://sgal-relayer.onrender.com/api/v1';  // Hardcoded fallback
```

### 3. ⚠️ Complex Integration in Components
Bridge and Swap components have complex manual flows instead of using SDK properly.

## How VelumX SDK Should Be Used by Any dApp

### Step 1: Install SDK
```bash
npm install @velumx/sdk
```

### Step 2: Initialize Client
```typescript
import { VelumXClient } from '@velumx/sdk';

const velumxClient = new VelumXClient({
  coreApiUrl: 'https://api.testnet.hiro.so',
  network: 'testnet',
  paymasterUrl: 'https://your-relayer.com/api/v1',
  apiKey: 'optional-api-key'
});
```

### Step 3: Estimate Fee
```typescript
const estimate = await velumxClient.estimateFee({
  estimatedGas: 100000  // Estimated gas in microSTX
});

console.log(`Fee: ${estimate.maxFeeUSDCx} microUSDCx`);
// Example: "250000" = 0.25 USDCx
```

### Step 4: Build Intent
```typescript
import { serializeCV, tupleCV, Cl } from '@stacks/transactions';

// Prepare the transaction payload
const payload = serializeCV(tupleCV({
  tokenIn: Cl.principal('ST...token-a'),
  tokenOut: Cl.principal('ST...token-b'),
  amountIn: Cl.uint('1000000'),
  minOut: Cl.uint('950000'),
  fee: Cl.uint(estimate.maxFeeUSDCx)
}));

const intent = {
  target: 'ST...CONTRACT.paymaster-module',
  payload: payload,  // Hex string
  maxFeeUSDCx: estimate.maxFeeUSDCx,
  nonce: currentNonce  // From smart wallet
};
```

### Step 5: Sign Intent (SIP-018)
```typescript
import { tupleCV, stringAsciiCV, uintCV, principalCV, bufferCV } from '@stacks/transactions';

// Domain for SIP-018
const domain = tupleCV({
  name: stringAsciiCV("VelumX-Smart-Wallet"),
  version: stringAsciiCV("1.0.0"),
  "chain-id": uintCV(2147483648)  // Testnet
});

// Message to sign
const message = tupleCV({
  target: principalCV(intent.target),
  payload: bufferCV(hexToBytes(intent.payload)),
  "max-fee-usdcx": uintCV(intent.maxFeeUSDCx),
  nonce: uintCV(intent.nonce)
});

// Use wallet to sign (Leather/Xverse)
const signature = await walletProvider.signStructuredMessage({
  domain,
  message
});
```

### Step 6: Submit to Relayer
```typescript
const signedIntent = {
  ...intent,
  signature
};

const result = await velumxClient.submitIntent(signedIntent);
console.log(`Transaction ID: ${result.txid}`);
```

## Simplified dApp Integration Pattern

### For Any Stacks dApp

```typescript
// 1. Import SDK
import { VelumXClient } from '@velumx/sdk';

// 2. Initialize once
const velumx = new VelumXClient({
  network: 'testnet',
  paymasterUrl: 'https://sgal-relayer.onrender.com/api/v1'
});

// 3. Use in your transaction flow
async function executeGaslessTransaction(
  contractCall: string,
  functionName: string,
  args: any[]
) {
  // Get fee estimate
  const estimate = await velumx.estimateFee({ estimatedGas: 100000 });
  
  // Build intent payload
  const payload = buildPayload(contractCall, functionName, args);
  
  // Get smart wallet nonce
  const nonce = await getSmartWalletNonce(userAddress);
  
  // Create intent
  const intent = {
    target: contractCall,
    payload,
    maxFeeUSDCx: estimate.maxFeeUSDCx,
    nonce
  };
  
  // Sign with wallet
  const signature = await signWithWallet(intent);
  
  // Submit
  const result = await velumx.submitIntent({ ...intent, signature });
  
  return result.txid;
}
```

## Recommended Implementation for Bridge & Swap

### Create Unified Gasless Service

```typescript
// frontend/lib/services/GaslessTransactionService.ts

import { VelumXClient } from '@velumx/sdk';
import { getVelumXClient } from '@/lib/velumx';
import { getSmartWalletAddress, getSmartWalletNonce } from '@/lib/stacks-wallet';
import { serializeCV, tupleCV, Cl } from '@stacks/transactions';

export class GaslessTransactionService {
  private velumx: VelumXClient;
  
  constructor() {
    this.velumx = getVelumXClient();
  }
  
  /**
   * Execute any gasless transaction
   */
  async executeGasless(params: {
    userAddress: string;
    targetContract: string;
    payload: any;  // Clarity tuple
    estimatedGas?: number;
  }): Promise<string> {
    // 1. Ensure smart wallet exists
    const smartWallet = await this.ensureSmartWallet(params.userAddress);
    
    // 2. Get fee estimate
    const estimate = await this.velumx.estimateFee({
      estimatedGas: params.estimatedGas || 100000
    });
    
    // 3. Get nonce
    const nonce = await getSmartWalletNonce(smartWallet);
    
    // 4. Serialize payload
    const payloadHex = serializeCV(params.payload);
    
    // 5. Build intent
    const intent = {
      target: params.targetContract,
      payload: payloadHex,
      maxFeeUSDCx: estimate.maxFeeUSDCx,
      nonce
    };
    
    // 6. Sign with wallet
    const signature = await this.signIntent(intent);
    
    // 7. Submit
    const result = await this.velumx.submitIntent({
      ...intent,
      signature
    });
    
    return result.txid;
  }
  
  /**
   * Ensure smart wallet is registered
   */
  private async ensureSmartWallet(userAddress: string): Promise<string> {
    let wallet = await getSmartWalletAddress(userAddress);
    
    if (!wallet) {
      // Auto-register
      const { registerSmartWallet } = await import('@/lib/registration');
      const result = await registerSmartWallet(userAddress);
      
      if (!result) {
        throw new Error('Smart wallet registration failed');
      }
      
      // Wait for confirmation
      await this.waitForConfirmation(result.txid);
      
      wallet = await getSmartWalletAddress(userAddress);
      if (!wallet) {
        throw new Error('Smart wallet not found after registration');
      }
    }
    
    return wallet;
  }
  
  /**
   * Sign intent using SIP-018
   */
  private async signIntent(intent: any): Promise<string> {
    const { getStacksConnect, getStacksCommon } = await import('@/lib/stacks-loader');
    const { tupleCV, stringAsciiCV, uintCV, principalCV, bufferCV } = await import('@stacks/transactions');
    
    const connect = await getStacksConnect();
    const common = await getStacksCommon();
    
    const domain = tupleCV({
      name: stringAsciiCV("VelumX-Smart-Wallet"),
      version: stringAsciiCV("1.0.0"),
      "chain-id": uintCV(2147483648)
    });
    
    const payloadBytes = common.hexToBytes(
      intent.payload.startsWith('0x') ? intent.payload.slice(2) : intent.payload
    );
    
    const message = tupleCV({
      target: principalCV(intent.target),
      payload: bufferCV(payloadBytes),
      "max-fee-usdcx": uintCV(intent.maxFeeUSDCx),
      nonce: uintCV(intent.nonce)
    });
    
    return new Promise((resolve, reject) => {
      connect.showSignStructuredMessage({
        domain,
        message,
        onFinish: (data: any) => {
          resolve(data.signature || data.result?.signature || data);
        },
        onCancel: () => {
          reject(new Error('User cancelled signature'));
        }
      });
    });
  }
  
  private async waitForConfirmation(txid: string): Promise<void> {
    // Poll for transaction confirmation
    const maxAttempts = 30;
    const delay = 2000;
    
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, delay));
      
      const response = await fetch(
        `https://api.testnet.hiro.so/extended/v1/tx/${txid}`
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.tx_status === 'success') {
          return;
        }
      }
    }
    
    throw new Error('Transaction confirmation timeout');
  }
}

// Singleton instance
let instance: GaslessTransactionService | null = null;

export function getGaslessService(): GaslessTransactionService {
  if (!instance) {
    instance = new GaslessTransactionService();
  }
  return instance;
}
```

### Simplified Bridge Usage

```typescript
// In BridgeInterface.tsx

import { getGaslessService } from '@/lib/services/GaslessTransactionService';

async function handleGaslessBridge() {
  const gaslessService = getGaslessService();
  
  // Build payload for bridge withdrawal
  const payload = tupleCV({
    amount: Cl.uint(amountInMicro),
    fee: Cl.uint(feeInMicro),
    recipient: Cl.buffer(recipientBytes)
  });
  
  // Execute gasless
  const txid = await gaslessService.executeGasless({
    userAddress: stacksAddress,
    targetContract: config.stacksPaymasterAddress,
    payload,
    estimatedGas: 100000
  });
  
  console.log('Bridge transaction:', txid);
}
```

### Simplified Swap Usage

```typescript
// In SwapInterface.tsx

import { getGaslessService } from '@/lib/services/GaslessTransactionService';

async function handleGaslessSwap() {
  const gaslessService = getGaslessService();
  
  // Build payload for swap
  const payload = tupleCV({
    tokenIn: Cl.principal(inputToken.address),
    tokenOut: Cl.principal(outputToken.address),
    amountIn: Cl.uint(amountInMicro),
    minOut: Cl.uint(minAmountOutMicro),
    fee: Cl.uint(feeInMicro)
  });
  
  // Execute gasless
  const txid = await gaslessService.executeGasless({
    userAddress: stacksAddress,
    targetContract: config.stacksPaymasterAddress,
    payload,
    estimatedGas: 100000
  });
  
  console.log('Swap transaction:', txid);
}
```

## Required Environment Variables

Add to `.env.local.example` and `.env.local`:

```bash
# VelumX SDK Configuration
NEXT_PUBLIC_VELUMX_RELAYER_URL=https://sgal-relayer.onrender.com/api/v1
NEXT_PUBLIC_VELUMX_API_KEY=  # Optional, for rate limiting bypass
```

## SDK API Reference

### VelumXClient Methods

#### `estimateFee(intent: any): Promise<{ maxFeeUSDCx: string, estimatedGas: number }>`
- **Purpose**: Get fee estimate in USDCx for a transaction
- **Input**: `{ estimatedGas: number }` - Estimated gas in microSTX
- **Output**: `{ maxFeeUSDCx: string, estimatedGas: number }`
- **Example**:
  ```typescript
  const estimate = await client.estimateFee({ estimatedGas: 100000 });
  // Returns: { maxFeeUSDCx: "250000", estimatedGas: 100000 }
  ```

#### `submitIntent(signedIntent: SignedIntent): Promise<{ txid: string, status: string }>`
- **Purpose**: Submit signed intent to relayer for sponsorship
- **Input**: SignedIntent with signature
- **Output**: Transaction ID and status
- **Example**:
  ```typescript
  const result = await client.submitIntent({
    target: 'ST...CONTRACT.paymaster',
    payload: '0x...',
    maxFeeUSDCx: '250000',
    nonce: 0,
    signature: '0x...'
  });
  // Returns: { txid: '0x...', status: 'broadcasted' }
  ```

#### `submitRawTransaction(txHex: string): Promise<{ txid: string, status: string }>`
- **Purpose**: Submit raw Stacks transaction hex for native sponsorship
- **Input**: Transaction hex string
- **Output**: Transaction ID and status
- **Use Case**: For sponsored transactions (like registration)

## Benefits of This Approach

1. ✅ **Single Responsibility**: SDK handles all relayer communication
2. ✅ **Reusable**: Same service for bridge, swap, and any future features
3. ✅ **Type Safe**: Full TypeScript support
4. ✅ **Error Handling**: Centralized error handling
5. ✅ **Testable**: Easy to mock and test
6. ✅ **dApp Ready**: Any Stacks dApp can use the same pattern

## Next Steps

1. Add missing environment variables
2. Create `GaslessTransactionService.ts`
3. Refactor `BridgeInterface.tsx` to use the service
4. Refactor `SwapInterface.tsx` to use the service
5. Add comprehensive error handling
6. Add transaction status tracking
7. Test end-to-end flows
