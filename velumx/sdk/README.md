# VelumX SDK

The first Paymaster infrastructure on Stacks blockchain. Enable gasless transactions in your dApp - users pay gas fees in USDCx instead of STX.

## 🚀 Features

- **Gasless Transactions**: Users pay fees in USDCx, not STX
- **Account Abstraction**: Smart Wallet pattern with SIP-018 signing
- **Simple Integration**: 3 lines of code to add gasless support
- **Production Ready**: Battle-tested relayer infrastructure
- **Developer Friendly**: TypeScript SDK with full type safety

## 📦 Installation

```bash
npm install @velumx/sdk
```

## 🔧 Quick Start

### 1. Get API Key

Register your dApp at [dashboard.velumx.com](https://dashboard.velumx.com) to get your API key.

### 2. Initialize Client

```typescript
import { VelumXClient } from '@velumx/sdk';

const velumx = new VelumXClient({
  coreApiUrl: 'https://api.testnet.hiro.so',
  network: 'testnet',
  paymasterUrl: 'https://relayer.velumx.com/api/v1',
  apiKey: 'your-api-key-here'
});
```

### 3. Estimate Fee

```typescript
const estimate = await velumx.estimateFee({
  estimatedGas: 100000
});

console.log(`Fee: ${estimate.maxFeeUSDCx} micro-USDCx`);
```

### 4. Submit Gasless Transaction

```typescript
import { tupleCV, uintCV, bufferCV, serializeCV } from '@stacks/transactions';

// Create your transaction payload
const payload = tupleCV({
  amount: uintCV(1000000), // 1 USDCx
  recipient: bufferCV(recipientBytes)
});

// Create intent
const intent = {
  target: 'ST...CONTRACT.paymaster-module-v10',
  payload: serializeCV(payload),
  maxFeeUSDCx: estimate.maxFeeUSDCx,
  nonce: currentNonce
};

// Sign with user's wallet (SIP-018)
const signature = await signWithWallet(intent);

// Submit to relayer
const result = await velumx.submitIntent({
  ...intent,
  signature
});

console.log(`Transaction ID: ${result.txid}`);
```

## 📚 API Reference

### VelumXClient

#### Constructor

```typescript
new VelumXClient(config: NetworkConfig)
```

**NetworkConfig:**
- `coreApiUrl`: Stacks API URL (mainnet/testnet)
- `network`: 'mainnet' | 'testnet' | 'devnet'
- `paymasterUrl`: VelumX relayer URL
- `apiKey`: Your dApp API key (optional for testnet)

#### Methods

##### estimateFee()

```typescript
estimateFee(intent: { estimatedGas: number }): Promise<{
  maxFeeUSDCx: string;
  estimatedGas: number;
}>
```

Get fee estimate in USDCx for a transaction.

##### submitIntent()

```typescript
submitIntent(signedIntent: SignedIntent): Promise<{
  txid: string;
  status: string;
}>
```

Submit a signed intent for gasless execution.

**SignedIntent:**
- `target`: Contract principal to call
- `payload`: Hex-encoded transaction payload
- `maxFeeUSDCx`: Maximum fee in micro-USDCx
- `nonce`: Smart Wallet nonce
- `signature`: SIP-018 signature

##### submitRawTransaction()

```typescript
submitRawTransaction(txHex: string): Promise<{
  txid: string;
  status: string;
}>
```

Submit a raw Stacks transaction for sponsorship.

## 🎯 Use Cases

### Bridge Transactions

```typescript
// User bridges USDC from Ethereum to Stacks
// Pays gas fee in USDCx instead of STX
const payload = tupleCV({
  amount: uintCV(5000000), // 5 USDCx
  fee: uintCV(250000),     // 0.25 USDCx fee
  recipient: bufferCV(ethAddressBytes)
});

const result = await velumx.submitIntent({
  target: 'ST...ADMIN.paymaster-module-v10',
  payload: serializeCV(payload),
  maxFeeUSDCx: '250000',
  nonce: 0,
  signature: userSignature
});
```

### Token Swaps

```typescript
// User swaps tokens without needing STX
const payload = tupleCV({
  tokenIn: principalCV('ST...TOKEN-A'),
  tokenOut: principalCV('ST...TOKEN-B'),
  amountIn: uintCV(1000000),
  minOut: uintCV(950000),
  fee: uintCV(200000)
});

const result = await velumx.submitIntent({
  target: 'ST...ADMIN.swap-contract',
  payload: serializeCV(payload),
  maxFeeUSDCx: '200000',
  nonce: 1,
  signature: userSignature
});
```

### NFT Minting

```typescript
// User mints NFT paying gas in USDCx
const payload = tupleCV({
  recipient: principalCV(userAddress),
  tokenId: uintCV(42),
  fee: uintCV(300000)
});

const result = await velumx.submitIntent({
  target: 'ST...ADMIN.nft-contract',
  payload: serializeCV(payload),
  maxFeeUSDCx: '300000',
  nonce: 2,
  signature: userSignature
});
```

## 🔐 Smart Wallet Setup

Users need a Smart Wallet to use gasless transactions. The SDK handles this automatically:

```typescript
import { getSmartWalletManager } from '@velumx/sdk';

const manager = getSmartWalletManager();

// Check if user has Smart Wallet
const hasWallet = await manager.hasSmartWallet(userAddress);

if (!hasWallet) {
  // Auto-register (one-time setup)
  const result = await manager.ensureSmartWallet(userAddress);
  console.log(`Smart Wallet: ${result}`);
}
```

## 💰 Fee Structure

- **Base Fee**: Actual STX gas cost converted to USDCx
- **Markup**: 8% (configurable by relayer)
- **Example**: 0.005 STX gas = ~$0.0025 = 0.0025 USDCx + 8% = 0.0027 USDCx

## 🌐 Network Support

### Testnet
- Relayer: `https://relayer.velumx.com/api/v1`
- Stacks API: `https://api.testnet.hiro.so`
- Free for development (no API key required)

### Mainnet
- Relayer: `https://mainnet-relayer.velumx.com/api/v1`
- Stacks API: `https://api.mainnet.hiro.so`
- Requires API key from dashboard

## 🛠️ Advanced Usage

### Custom Fee Calculation

```typescript
// Get exchange rates
const rates = await velumx.getExchangeRates();
console.log(`STX/USD: ${rates.stxToUsd}`);

// Calculate custom fee
const gasInStx = 0.005;
const gasInUsd = gasInStx * rates.stxToUsd;
const feeInUsdcx = gasInUsd * 1.08; // 8% markup
```

### Transaction Monitoring

```typescript
// Submit transaction
const result = await velumx.submitIntent(signedIntent);

// Monitor status
const status = await fetch(
  `https://api.testnet.hiro.so/extended/v1/tx/${result.txid}`
);

const data = await status.json();
console.log(`Status: ${data.tx_status}`);
```

### Error Handling

```typescript
try {
  const result = await velumx.submitIntent(signedIntent);
} catch (error) {
  if (error.message.includes('insufficient balance')) {
    console.error('User needs more USDCx for fees');
  } else if (error.message.includes('invalid signature')) {
    console.error('Signature verification failed');
  } else {
    console.error('Transaction failed:', error);
  }
}
```

## 📖 Examples

Check out complete examples:
- [Bridge dApp](../examples/bridge)
- [DEX Integration](../examples/swap)
- [NFT Marketplace](../examples/nft)

## 🤝 Support

- **Documentation**: [docs.velumx.com](https://docs.velumx.com)
- **Dashboard**: [dashboard.velumx.com](https://dashboard.velumx.com)
- **Discord**: [discord.gg/velumx](https://discord.gg/velumx)
- **Email**: support@velumx.com

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details

## 🎉 Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

Built with ❤️ by the VelumX team
