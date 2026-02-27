# SGAL Integration Guide

This guide will walk you through the process of integrating gasless features into your dApp using the VelumX Gas Abstraction Layer (SGAL).

## Prerequisites

- A Stacks wallet (Leather, Xverse)
- Basic understanding of Stacks contract calls
- An SGAL API Key (for production)

## Step 1: Install the SDK

(Coming Soon)

```bash
npm install @velumx/sgal-sdk
```

## Step 2: Initialize the Client

```typescript
const client = new SGALClient({
  network: 'testnet'
});
```

## Step 3: Check Sponsorship Eligibility

Before offering a gasless transaction to a user, check the current fee estimates.

```typescript
const fee = await client.estimateFee({
  gasUsage: 100000 // Estimated Micro-STX gas
});

console.log(`Estimated cost: ${fee.usdcx} USDCx`);
```

## Step 4: Execute a Gasless Call

(Detailed implementation steps will be added as we build the SDK)
