# VelumX

> Gasless transaction infrastructure for Stacks - Pay fees in USDCx, not STX

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Stacks](https://img.shields.io/badge/Stacks-Testnet-5546FF)](https://www.stacks.co/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)

## What is VelumX?

VelumX eliminates the need for users to hold STX tokens by allowing them to pay transaction fees in USDCx. Built on Stacks (Bitcoin L2), VelumX makes DeFi accessible to anyone who bridges USDC from Ethereum.

## The Problem

When users bridge USDC to Stacks, they can't use it until they acquire STX for gas fees. This creates friction and limits adoption.

## The Solution

VelumX uses a paymaster pattern with sponsored transactions:
- Users pay fees in USDCx
- Relayer sponsors transactions with STX
- Seamless UX without native token requirements

## Features

- 🚀 **Gasless Transactions** - Pay all fees in USDCx
- 🌉 **Cross-Chain Bridge** - USDC ↔ USDCx (Ethereum ↔ Stacks)
- 🔄 **Token Swaps** - Swap USDCx for STX and other tokens
- 👛 **Multi-Wallet** - MetaMask, Rabby, Xverse, Leather, Hiro
- 🛠️ **Developer SDK** - Easy integration with `@velumx/sdk`

## Quick Start

### For Users

1. Visit [velumx.vercel.app](https://velumx.vercel.app)
2. Connect your Ethereum and Stacks wallets
3. Bridge USDC from Ethereum to Stacks
4. Use DeFi features without needing STX!

### For Developers

```bash
# Install SDK
npm install @velumx/sdk

# Use in your dApp
import { sponsorTransaction } from '@velumx/sdk';

const sponsored = await sponsorTransaction({
  transaction: unsignedTx,
  network: 'testnet'
});
```

Get your API key at [velum-x-ssum.vercel.app/](https://velum-x-ssum.vercel.app/)

## Project Structure

```
VelumX/
├── frontend/              # DeFi application (Next.js)
├── velumx/
│   ├── sdk/              # @velumx/sdk package
│   ├── contracts/        # Clarity smart contracts
│   ├── relayer/          # Backend sponsorship service
│   └── dashboard/        # Developer portal
└── docs/                 # Technical documentation
```

## Documentation

- **[Technical Documentation](./docs/TECHNICAL_DOCUMENTATION.md)** - Complete technical guide
- **[SDK Reference](./velumx/sdk/README.md)** - SDK API documentation
- **[Dashboard Setup](./velumx/dashboard/SETUP.md)** - Developer dashboard guide

## Technology

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, PostgreSQL (Supabase)
- **Blockchain**: Stacks (Clarity), Ethereum (Solidity)
- **Auth**: Supabase Auth (Email + GitHub OAuth)

## Deployed Contracts (Testnet)

**Simple Paymaster**
```
STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.simple-paymaster-v1
```

**USDCx Token**
```
ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx
```

## Local Development

```bash
# Clone repository
git clone https://github.com/yourusername/velumx.git
cd velumx

# Install dependencies
npm install

# Run frontend
cd frontend
npm run dev

# Run relayer (separate terminal)
cd velumx/relayer
npm run dev

# Run dashboard (separate terminal)
cd velumx/dashboard
npm run dev
```

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Links

- **Discord**: [discord.gg/polimaf](https://discord.gg/polimaf)
- **Twitter**: [@leprofcode](https://twitter.com/leprofcode)

---

Built with ❤️ for the Stacks ecosystem
