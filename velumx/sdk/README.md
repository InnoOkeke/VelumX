# @velumx/sdk

> Universal Gasless transaction SDK for Stacks - Pay fees in sBTC, USDCx, ALEX, or any SIP-010 token.

[![npm version](https://img.shields.io/npm/v/@velumx/sdk.svg)](https://www.npmjs.com/package/@velumx/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

VelumX SDK enables gasless transactions on Stacks blockchain. Users pay transaction fees in their preferred SIP-010 tokens instead of STX using Stacks' native sponsored transaction feature.

### Key Features

- 🪙 **Any Token Gas** - Users can pay in sBTC, USDCx, ALEX, aUSD, or any custom SIP-010.
- ⚡ **Native Sponsorship** - Uses Stacks' built-in `sponsored` flag.
- 🔧 **Simple Integration** - Standardized helper methods for Swap, Bridge, and Transfer.
- 🛡️ **Secure** - Registry-based authorization on Stacks Mainnet.

## Installation

```bash
npm install @velumx/sdk
```

## Quick Start (Production Pattern)

### 1. Initialize Client
Initialize the client pointing to your backend proxy or the VelumX Relayer.

```typescript
import { VelumXClient } from '@velumx/sdk';

const velumx = new VelumXClient({
  relayerUrl: 'https://relayer.velumx.com',
  network: 'mainnet'
});
```

### 2. Estimate Fee
Request a real-time fee estimation for a specific token.

```typescript
const estimate = await velumx.estimateFee({ 
  estimatedGas: 100000,
  feeToken: 'SM3KNVZS30WM7F89SXKVVFY4SN9RMPZZ9FX929N0V.sbtc' // Pay in sBTC
});

console.log(`Estimated Fee: ${estimate.feeAmount} ${estimate.feeToken}`);
```

### 3. Execute Gasless Action
Apply the sponsorship to your contract call.

```typescript
const result = await velumx.executeGasless({
  target: 'SP...YOUR_CONTRACT',
  actionId: '0x...', 
  param: '100',
  feeAmount: estimate.feeAmount,
  feeToken: estimate.feeToken,
  onFinish: (data) => console.log(`Transaction ID: ${data.txid}`)
});
```

## API Reference

### VelumXClient

#### Methods

##### `.estimateFee(options)`
Get a real-time fee estimation from the relayer.
- `options`:
    - `feeToken`: (Optional) The SIP-010 contract principal you want to pay with.
    - `estimatedGas`: (Optional) Expected gas consumption.

##### `.executeGasless(params)`
The standard method for executing any gasless contract call.
- `params`:
    - `target`: Contract address of the target protocol.
    - `feeAmount`: The amount returned by `.estimateFee()`.
    - `feeToken`: The token principal used for the fee.

## Multi-tenant Support
Each developer gets a unique relayer address. Ensure your Relayer is authorized in the VelumX Dashboard to collect fees directly into your own wallet.

---

### v2.5.0 (Latest)
- ✅ **Universal Tokens**: Added support for sBTC, ALEX, aUSD.
- ✅ **Refactored Names**: `feeUsdcx` renamed to `feeAmount` for universality.
- ✅ **Mainnet Ready**: Pointed to the new Universal Paymaster at `SPKYNF473GQ1V0WWCF24TV7ZR1WYAKTC7AM8QGBW`.

Built with ❤️ by the VelumX team
 ❤️ by the VelumX team
