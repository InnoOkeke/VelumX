# VelumX Stacks Gas Abstraction Layer (SGAL) Documentation

Welcome to the official developer documentation for **SGAL**. This infrastructure is designed to enable seamless, gasless interactions on the Stacks blockchain for various dApps.

## 📚 Documentation Index

- **[Integration Guide](./integration-guide.md)**: How to get started and integrate the SGAL SDK into your dApp.
- **[API Reference](./api-reference.md)**: Detailed documentation for the SGAL REST API and backend services.
- **[Smart Wallet Architecture](./smart-wallet-architecture.md)**: Technical deep-dive into the Clarity smart wallet system.
- **[Security & Compliance](./security.md)**: Information on our security features, including signature protection and fee caps.

## 🚀 Quick Start (Concept)

```typescript
import { SGALClient } from '@velumx/sgal-sdk';

const client = new SGALClient({
  network: 'testnet',
  apiKey: 'YOUR_API_KEY'
});

// Build a gasless swap intent
const intent = await client.buildIntent({
  contractAddress: '...',
  functionName: 'swap',
  args: [...]
});

// Sign and broadcast
const txid = await client.submitIntent(intent);
```
