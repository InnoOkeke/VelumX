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

## Quick Start (Production Pattern)

### 1. Initialize Client via Proxy
For production dApps, initialize the client pointing to your backend proxy to keep your API key secure.

```typescript
import { VelumXClient } from '@velumx/sdk';

const velumx = new VelumXClient({
  paymasterUrl: '/api/velumx/proxy', // Your secure backend proxy
  network: 'mainnet'
});
```

### 2. Request Sponsorship
Use the **`.sponsor()`** method to request gas sponsorship while reporting your custom fee for the VelumX Dashboard.

```typescript
// Report your dApp's specific fee and a unique user ID for tracking
const result = await velumx.sponsor(txRaw, {
  feeAmount: '250000', // 0.25 USDCx (6 decimals)
  userId: 'user_12345'
});

console.log(`Transaction Sponsored: ${result.txid}`);
```

## Security Best Practice: The Proxy Pattern

**NEVER** expose your `VELUMX_API_KEY` in the browser. Instead, create a simple backend route that injects the key and forwards the request to the VelumX Relayer.

### Example Next.js Proxy Route
```typescript
// app/api/velumx/proxy/[...path]/route.ts
export async function POST(req: Request, { params }) {
  const { path } = params;
  const apiKey = process.env.VELUMX_API_KEY; // Securely stored on server
  const targetUrl = `https://relayer.velumx.com/api/v1/${path.join('/')}`;

  const body = await req.json();
  const response = await fetch(targetUrl, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-api-key': apiKey 
    },
    body: JSON.stringify(body),
  });

  return Response.json(await response.json());
}
```

## API Reference

### VelumXClient

#### Methods

##### `.sponsor(txHex, options)`
The recommended method for Stacks-native sponsorship.

- `txHex`: The raw hex string of the signed transaction.
- `options`:
    - `feeAmount`: (Optional) The specific fee collected by your contract (e.g., "250000").
    - `userId`: (Optional) A unique identifier for your user to enable multi-tenant wallet tracking.

##### `.estimateFee(intent)`
Get a real-time USDCx fee estimation for a transaction intent.
- `intent`: The transaction details (target, function, args).

##### `.submitIntent(signedIntent)`
Submit a SIP-018 signed intent for legacy smart-wallet sponsorship.

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

### 4. Using Different Fee Tokens

Pay fees in sBTC, ALEX, or any SIP-010 token.

```typescript
async function gaslessWithSBTC(amount: string) {
  const velumx = getVelumXClient();
  
  // 1. Estimate fee (returns USDCx equivalent)
  const estimate = await velumx.estimateFee({
    estimatedGas: 100000
  });
  
  // 2. Convert fee to sBTC (example: 0.54 USDCx → 0.000012 BTC)
  const feeInSBTC = convertToSBTC(estimate.maxFeeUSDCx);
  
  // 3. Execute with sBTC as fee token
  const result = await openContractCall({
    contractAddress: 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P',
    contractName: 'simple-paymaster-v1',
    functionName: 'bridge-gasless',
    functionArgs: [
      Cl.uint(parseUnits(amount, 6)),
      Cl.buffer(recipientBytes),
      Cl.uint(feeInSBTC),  // Fee in sBTC
      Cl.principal('STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P'),
      Cl.principal('SM3KNVZS30WM7F89SXKVVFY4SN9RMPZZ9FX929N0V.sbtc')  // sBTC token
    ],
    sponsored: true,
    network: 'testnet',
    onFinish: async (data) => {
      const tx = await velumx.submitRawTransaction(data.txRaw);
      console.log(`Transaction: ${tx.txid}`);
    }
  });
}

// Helper: Convert USDCx fee to sBTC
function convertToSBTC(feeInUSDCx: string): string {
  // Example conversion (fetch real rates from API)
  const usdcAmount = Number(feeInUSDCx) / 1_000_000; // 0.54 USDC
  const btcPrice = 45000; // $45,000 per BTC
  const btcAmount = usdcAmount / btcPrice; // 0.000012 BTC
  const satoshis = Math.ceil(btcAmount * 100_000_000); // 1,200 sats
  return satoshis.toString();
}

// Using ALEX token
async function gaslessWithALEX(amount: string) {
  const velumx = getVelumXClient();
  
  const estimate = await velumx.estimateFee({
    estimatedGas: 100000
  });
  
  // Convert to ALEX (example: 0.54 USDCx → 5.4 ALEX)
  const feeInALEX = convertToALEX(estimate.maxFeeUSDCx);
  
  const result = await openContractCall({
    contractAddress: 'STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P',
    contractName: 'simple-paymaster-v1',
    functionName: 'bridge-gasless',
    functionArgs: [
      Cl.uint(parseUnits(amount, 6)),
      Cl.buffer(recipientBytes),
      Cl.uint(feeInALEX),  // Fee in ALEX
      Cl.principal('STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P'),
      Cl.principal('ALEX_TOKEN_ADDRESS')  // ALEX token
    ],
    sponsored: true,
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

### Supported Fee Tokens

VelumX accepts ANY SIP-010 token for gas fees. The paymaster contract uses the `<sip-010-trait>` parameter for universal compatibility.

**Popular Tokens:**

| Token | Contract Address | Decimals | Use Case |
|-------|-----------------|----------|----------|
| USDCx | `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx` | 6 | Stablecoin fees |
| sBTC | `SM3KNVZS30WM7F89SXKVVFY4SN9RMPZZ9FX929N0V.sbtc` | 8 | Bitcoin fees |
| ALEX | `ALEX_TOKEN_ADDRESS` | 6 | DeFi token fees |
| STX | Native | 6 | Native token fees |

**Exchange Rate Calculation:**

```typescript
// Fetch real-time exchange rates
async function calculateFeeInToken(
  feeInUSDCx: string,
  targetToken: 'sBTC' | 'ALEX' | 'STX'
): Promise<string> {
  const usdcAmount = Number(feeInUSDCx) / 1_000_000;
  
  // Fetch rates from price oracle or API
  const rates = await fetchExchangeRates();
  
  switch (targetToken) {
    case 'sBTC':
      const btcAmount = usdcAmount / rates.BTC_USD;
      return Math.ceil(btcAmount * 100_000_000).toString(); // Convert to satoshis
    
    case 'ALEX':
      const alexAmount = usdcAmount / rates.ALEX_USD;
      return Math.ceil(alexAmount * 1_000_000).toString(); // Convert to micro-ALEX
    
    case 'STX':
      const stxAmount = usdcAmount / rates.STX_USD;
      return Math.ceil(stxAmount * 1_000_000).toString(); // Convert to micro-STX
    
    default:
      return feeInUSDCx;
  }
}

// Example usage
const estimate = await velumx.estimateFee({ estimatedGas: 100000 });
const feeInSBTC = await calculateFeeInToken(estimate.maxFeeUSDCx, 'sBTC');
```

### Environment Variables

```bash
# Frontend (.env.local)
NEXT_PUBLIC_STACKS_NETWORK=mainnet
NEXT_PUBLIC_STACKS_API_URL=https://api.mainnet.hiro.so
NEXT_PUBLIC_VELUMX_RELAYER_URL=https://your-relayer-proxy.com

# Contracts
NEXT_PUBLIC_STACKS_PAYMASTER_ADDRESS=SP...YOUR_PAYMASTER_ADDRESS
NEXT_PUBLIC_STACKS_USDCX_ADDRESS=SP...YOUR_USDCX_ADDRESS
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
Explorer: https://explorer.hiro.so/txid/[TRANSACTION_ID]?chain=testnet
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
**A:** No! Users only need any SIP-010 token (USDCx, sBTC, ALEX, etc.). The relayer pays STX fees.

### Q: What tokens can I use for fees?
**A:** Any SIP-010 compliant token! Popular options include USDCx, sBTC, ALEX, and STX. The paymaster contract uses the `<sip-010-trait>` parameter for universal compatibility.

### Q: How much does it cost?
**A:** Fees are calculated in real-time based on STX/USD rates with an 8% markup. Typically 0.001-0.01 USDCx (or equivalent in other tokens) per transaction.

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
