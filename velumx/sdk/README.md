# @velumx/sdk

> Gasless transaction SDK for Stacks - Pay fees in USDCx, not STX

[![npm version](https://img.shields.io/npm/v/@velumx/sdk.svg)](https://www.npmjs.com/package/@velumx/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

VelumX SDK enables gasless transactions on Stacks blockchain. Users pay transaction fees in USDCx instead of STX using Stacks' native sponsored transaction feature.

### Key Features

- � **Zero STX Required** - Users only need USDCx
- ⚡ **Native Sponsorship** - Uses Stacks' built-in `sponsored` flag
- 🔧 **Simple Integration** - 3 lines of code
- 📦 **Lightweight** - ~50KB minified
- � **Secure** - No smart wallet complexity

## Installation

```bash
npm install @velumx/sdk
```

## Quick Start

### 1. Initialize Client

```typescript
import { getVelumXClient } from '@velumx/sdk';

const velumx = getVelumXClient();
```

### 2. Estimate Fee

```typescript
const estimate = await velumx.estimateFee({
  estimatedGas: 100000
});

console.log(`Fee: ${estimate.maxFeeUSDCx} micro-USDCx`);
// Output: Fee: 540000 micro-USDCx (0.54 USDCx)
```

### 3. Execute Gasless Transaction

```typescript
import { openContractCall } from '@stacks/connect';
import { Cl } from '@stacks/transactions';

// Call paymaster contract with sponsored=true
const result = await openContractCall({
  contractAddress: 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P',
  contractName: 'simple-paymaster-v1',
  functionName: 'bridge-gasless',
  functionArgs: [
    Cl.uint(10000000),  // 10 USDCx
    Cl.buffer(recipientBytes),
    Cl.uint(estimate.maxFeeUSDCx),
    Cl.principal('STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P'),
    Cl.principal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx')
  ],
  sponsored: true,  // Enable gasless mode
  network: 'testnet',
  onFinish: async (data) => {
    // Submit to relayer for sponsorship
    const tx = await velumx.submitRawTransaction(data.txRaw);
    console.log(`Transaction: ${tx.txid}`);
  }
});
```

## How It Works

### Architecture

```
┌──────────┐                                      ┌──────────┐
│   User   │                                      │ Relayer  │
└────┬─────┘                                      └────┬─────┘
     │                                                  │
     │ 1. Request fee estimate                         │
     ├──────────────────────────────────────────────►  │
     │                                                  │
     │ 2. Return fee in USDCx                          │
     │ ◄──────────────────────────────────────────────┤
     │                                                  │
     │ 3. Sign transaction (sponsored=true)            │
     │                                                  │
     │ 4. Submit signed transaction                    │
     ├──────────────────────────────────────────────►  │
     │                                                  │
     │                                                  │ 5. Sponsor with STX
     │                                                  │    & broadcast
     │                                                  │
     │ 6. Return transaction ID                        │
     │ ◄──────────────────────────────────────────────┤
     │                                                  │
     ▼                                                  ▼

┌─────────────────────────────────────────────────────┐
│              Stacks Blockchain                       │
│                                                      │
│  simple-paymaster-v1::bridge-gasless                │
│  • Transfer USDCx fee from user to relayer          │
│  • Execute core logic (burn/swap)                   │
│  • Transaction confirmed ✓                          │
└─────────────────────────────────────────────────────┘
```

### Fee Calculation

```
Fee in USDCx = (Gas Cost in STX × STX/USD Rate × 1.08) / USDC/USD Rate

Example:
- Gas: 100,000 units = 1 STX
- STX/USD: $0.50
- Markup: 8%
- Fee: 1 × $0.50 × 1.08 = $0.54 = 0.54 USDCx
```

## API Reference

### VelumXClient

#### Configuration

```typescript
interface NetworkConfig {
  coreApiUrl: string;      // Stacks API URL
  network: 'mainnet' | 'testnet' | 'devnet';
  paymasterUrl?: string;   // Relayer URL (optional)
}
```

**Default Configuration**:
```typescript
{
  coreApiUrl: 'https://api.testnet.hiro.so',
  network: 'testnet',
  paymasterUrl: 'https://sgal-relayer.onrender.com/api/v1'
}
```

#### Methods

##### estimateFee()

Get fee estimate in USDCx for a transaction.

```typescript
estimateFee(params: {
  estimatedGas: number
}): Promise<FeeEstimate>
```

**Parameters**:
- `estimatedGas`: Estimated gas units (e.g., 100000)

**Returns**:
```typescript
interface FeeEstimate {
  maxFeeUSDCx: string;    // Fee in micro-USDCx
  estimatedGas: number;    // Gas units
  stxToUsd?: number;       // Exchange rate
  markup?: number;         // Fee markup (0.08 = 8%)
}
```

**Example**:
```typescript
const estimate = await velumx.estimateFee({
  estimatedGas: 100000
});

console.log(`Fee: ${estimate.maxFeeUSDCx} micro-USDCx`);
// Fee: 540000 micro-USDCx (0.54 USDCx)
```

##### submitRawTransaction()

Submit a signed transaction for sponsorship.

```typescript
submitRawTransaction(txRaw: string): Promise<TransactionResult>
```

**Parameters**:
- `txRaw`: Hex-encoded signed transaction from wallet

**Returns**:
```typescript
interface TransactionResult {
  txid: string;           // Transaction ID
  status: string;         // Status (pending/success/failed)
}
```

**Example**:
```typescript
const result = await velumx.submitRawTransaction(data.txRaw);
console.log(`Transaction ID: ${result.txid}`);
```

##### sponsorTransaction()

High-level helper to make any transaction gasless.

```typescript
sponsorTransaction(params: {
  transaction: any;
  network: 'mainnet' | 'testnet';
}): Promise<any>
```

**Parameters**:
- `transaction`: Unsigned Stacks transaction
- `network`: Target network

**Returns**: Transaction with `sponsored: true` flag

**Example**:
```typescript
import { makeContractCall } from '@stacks/transactions';

const unsignedTx = await makeContractCall({...});

const sponsored = await velumx.sponsorTransaction({
  transaction: unsignedTx,
  network: 'testnet'
});

// User signs and broadcasts
const result = await openContractCall(sponsored);
```

## Use Cases

### 1. Gasless Bridge

Bridge USDC from Ethereum to Stacks without needing STX.

```typescript
import { getVelumXClient } from '@velumx/sdk';
import { openContractCall } from '@stacks/connect';
import { Cl } from '@stacks/transactions';
import { parseUnits } from 'viem';

async function gaslessBridge(amount: string, recipient: string) {
  const velumx = getVelumXClient();
  
  // 1. Estimate fee
  const estimate = await velumx.estimateFee({
    estimatedGas: 100000
  });
  
  // 2. Encode Ethereum address
  const recipientBytes = encodeEthereumAddress(recipient);
  
  // 3. Execute gasless bridge
  const result = await openContractCall({
    contractAddress: 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P',
    contractName: 'simple-paymaster-v1',
    functionName: 'bridge-gasless',
    functionArgs: [
      Cl.uint(parseUnits(amount, 6)),
      Cl.buffer(recipientBytes),
      Cl.uint(estimate.maxFeeUSDCx),
      Cl.principal('STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P'),
      Cl.principal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx')
    ],
    sponsored: true,
    network: 'testnet',
    onFinish: async (data) => {
      const tx = await velumx.submitRawTransaction(data.txRaw);
      console.log(`Bridge transaction: ${tx.txid}`);
    }
  });
}

// Helper function
function encodeEthereumAddress(address: string): Uint8Array {
  const hex = address.startsWith('0x') ? address.slice(2) : address;
  const paddedHex = hex.padStart(64, '0');
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(paddedHex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
```

### 2. Gasless Swap

Swap tokens without holding STX.

```typescript
async function gaslessSwap(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  minOut: string
) {
  const velumx = getVelumXClient();
  
  // 1. Estimate fee
  const estimate = await velumx.estimateFee({
    estimatedGas: 150000
  });
  
  // 2. Execute gasless swap
  const result = await openContractCall({
    contractAddress: 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P',
    contractName: 'simple-paymaster-v1',
    functionName: 'swap-gasless',
    functionArgs: [
      Cl.principal(tokenIn),
      Cl.principal(tokenOut),
      Cl.uint(parseUnits(amountIn, 6)),
      Cl.uint(parseUnits(minOut, 6)),
      Cl.uint(estimate.maxFeeUSDCx),
      Cl.principal('STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P'),
      Cl.principal('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx')
    ],
    sponsored: true,
    network: 'testnet',
    onFinish: async (data) => {
      const tx = await velumx.submitRawTransaction(data.txRaw);
      console.log(`Swap transaction: ${tx.txid}`);
    }
  });
}
```

### 3. Custom Gasless Transaction

Make any contract call gasless.

```typescript
async function customGaslessTransaction() {
  const velumx = getVelumXClient();
  
  // 1. Estimate fee
  const estimate = await velumx.estimateFee({
    estimatedGas: 120000
  });
  
  // 2. Your custom contract call
  const result = await openContractCall({
    contractAddress: 'YOUR_CONTRACT_ADDRESS',
    contractName: 'your-contract',
    functionName: 'your-function',
    functionArgs: [
      // Your function args
      Cl.uint(estimate.maxFeeUSDCx),  // Include fee
      // More args...
    ],
    sponsored: true,  // Enable gasless
    network: 'testnet',
    onFinish: async (data) => {
      const tx = await velumx.submitRawTransaction(data.txRaw);
      console.log(`Transaction: ${tx.txid}`);
    }
  });
}
```

## Smart Contract Integration

To make your contract gasless-compatible, accept a fee parameter and transfer it to the relayer:

```clarity
(define-public (your-gasless-function
    (amount uint)
    (fee-usdcx uint)
    (relayer principal)
    (fee-token <sip-010-trait>))
  (begin
    ;; 1. Transfer fee from user to relayer
    (try! (contract-call? fee-token transfer 
      fee-usdcx tx-sender relayer none))
    
    ;; 2. Your contract logic
    (try! (your-logic amount))
    
    (ok true)
  )
)
```

## Configuration

### Environment Variables

```bash
# Frontend (.env.local)
NEXT_PUBLIC_STACKS_NETWORK=testnet
NEXT_PUBLIC_STACKS_API_URL=https://api.testnet.hiro.so
NEXT_PUBLIC_VELUMX_RELAYER_URL=https://sgal-relayer.onrender.com/api/v1

# Contracts
NEXT_PUBLIC_STACKS_PAYMASTER_ADDRESS=STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.simple-paymaster-v1
NEXT_PUBLIC_STACKS_USDCX_ADDRESS=ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx
```

### Network Configuration

```typescript
// Testnet (default)
const velumx = getVelumXClient();

// Mainnet
const velumx = new VelumXClient({
  coreApiUrl: 'https://api.mainnet.hiro.so',
  network: 'mainnet',
  paymasterUrl: 'https://mainnet-relayer.velumx.com/api/v1'
});
```

## Error Handling

```typescript
try {
  const estimate = await velumx.estimateFee({
    estimatedGas: 100000
  });
  
  const result = await openContractCall({
    // ... transaction params
    onFinish: async (data) => {
      try {
        const tx = await velumx.submitRawTransaction(data.txRaw);
        console.log(`Success: ${tx.txid}`);
      } catch (error) {
        if (error.message.includes('insufficient balance')) {
          console.error('User needs more USDCx for fees');
        } else if (error.message.includes('invalid signature')) {
          console.error('Signature verification failed');
        } else {
          console.error('Transaction failed:', error);
        }
      }
    },
    onCancel: () => {
      console.log('User cancelled transaction');
    }
  });
} catch (error) {
  console.error('Failed to estimate fee:', error);
}
```

## Testing

### Unit Tests

```bash
npm test
```

### Integration Tests

```bash
npm run test:integration
```

### Example Test

```typescript
import { getVelumXClient } from '@velumx/sdk';

describe('VelumX SDK', () => {
  it('should estimate fee correctly', async () => {
    const velumx = getVelumXClient();
    
    const estimate = await velumx.estimateFee({
      estimatedGas: 100000
    });
    
    expect(estimate.maxFeeUSDCx).toBeDefined();
    expect(Number(estimate.maxFeeUSDCx)).toBeGreaterThan(0);
  });
});
```

## Deployed Contracts

### Testnet

**Simple Paymaster**
```
Address: STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.simple-paymaster-v1
Network: Stacks Testnet
Explorer: https://explorer.hiro.so/txid/0x90c134205b04599405e3cccae6c86ed496ae2d81ef0392970e2c9a7acd3b2138?chain=testnet
```

**USDCx Token**
```
Address: ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx
Standard: SIP-010
Decimals: 6
```

**Relayer**
```
URL: https://sgal-relayer.onrender.com/api/v1
Status: https://sgal-relayer.onrender.com/api/v1/health
```

## FAQ

### Q: Do users need STX?
**A:** No! Users only need USDCx. The relayer pays STX fees.

### Q: How much does it cost?
**A:** Fees are calculated in real-time based on STX/USD rates with an 8% markup. Typically 0.001-0.01 USDCx per transaction.

### Q: Is it secure?
**A:** Yes! Uses Stacks' native sponsored transaction feature. No smart wallet complexity.

### Q: What wallets are supported?
**A:** Any Stacks wallet (Xverse, Leather, Hiro) that supports sponsored transactions.

### Q: Can I use this in production?
**A:** Currently on testnet. Mainnet launch pending security audit.

### Q: How do I get an API key?
**A:** Visit [https://velum-x-ssum.vercel.app](https://velum-x-ssum.vercel.app) to sign up and generate API keys.

## Examples

Complete examples available in the repository:

- [Bridge Example](../examples/bridge)
- [Swap Example](../examples/swap)
- [Custom Integration](../examples/custom)

## Support

- **Documentation**: [docs.velumx.com](https://docs.velumx.com)
- **Dashboard**: [https://velum-x-ssum.vercel.app](https://velum-x-ssum.vercel.app)
- **Discord**: [discord.gg/velumx](https://discord.gg/velumx)
- **Email**: support@velumx.com
- **GitHub Issues**: [github.com/velumx/sdk/issues](https://github.com/velumx/sdk/issues)

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Changelog

### v2.0.0 (Current)
- ✅ Simplified architecture (removed smart wallets)
- ✅ Native Stacks sponsored transactions
- ✅ Simple paymaster contract
- ✅ Improved performance and reliability

### v1.0.0
- Initial release with smart wallet pattern

---

Built with ❤️ by the VelumX team
