# VelumX

> Gasless transaction infrastructure for Stacks - Pay fees in any SIP-010 token, not STX

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Stacks](https://img.shields.io/badge/Stacks-Testnet-5546FF)](https://www.stacks.co/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)

## What is VelumX?

VelumX eliminates the need for users to hold STX tokens by allowing them to pay transaction fees in any SIP-010 token (USDCx, sBTC, ALEX, etc.). Built on Stacks (Bitcoin L2), VelumX makes DeFi accessible to anyone with any token.

## The Problem

When users bridge assets to Stacks, they can't use them until they acquire STX for gas fees. This creates friction and limits adoption.

## The Solution

VelumX uses a universal paymaster pattern with sponsored transactions:
- Users pay fees in any SIP-010 token (USDCx, sBTC, ALEX, etc.)
- Relayer sponsors transactions with STX
- Seamless UX without native token requirements

## Features

- 🚀 **Gasless Transactions** - Pay fees in any SIP-010 token with optimized 0.001 STX sponsorship
- 💰 **Multi-Token Support** - USDCx, sBTC, ALEX, or any SIP-010 token
- 🛡️ **Developer Dashboard** - Manage API keys, track revenue, and monitor sponsorship health
- 👛 **Relayer Wallet** - View sponsorship addresses and export private keys to Leather/Xverse
- 🛠️ **Modern SDK** - Simple integration with `@velumx/sdk@2.2.0` and secure proxy support

## Quick Start

### For Users

1. Visit [app.velumx.xyz](https://app.velumx.xyz)
2. Connect your Ethereum and Stacks wallets
3. Bridge USDC from Ethereum to Stacks (Fee: 0.25 USDCx)
4. Use DeFi features without needing STX!

### For Developers (Infrastructure)

VelumX provides a secure, multi-tenant infrastructure for any Stacks dApp.

```bash
# Install SDK
npm install @velumx/sdk
```

**Secure Sponsorship Example:**

```typescript
import { getVelumXClient } from '@velumx/sdk';

const velumx = new VelumXClient({ 
  paymasterUrl: '/api/velumx/proxy', // Use a secure server-side proxy
  network: 'mainnet' 
});

// Sponsor a transaction and report your custom fee for the dashboard
const result = await velumx.sponsor(txHex, { 
  feeAmount: '250000', // e.g., 0.25 USDCx
  userId: 'user-unique-id' 
});
```

Get your API key at [dashboard.velumx.xyz](https://dashboard.velumx.xyz)

## Project Structure

```
VelumX/
├── frontend/              # DeFi application (Next.js) - Bridge Example
├── velumx/
│   ├── sdk/              # @velumx/sdk package (@2.2.0)
│   ├── relayer/          # Multi-tenant sponsorship engine
│   └── dashboard/        # Developer portal & analytics
└── docs/                 # Technical documentation
```

## Documentation

- **[Technical Documentation](./docs/TECHNICAL_DOCUMENTATION.md)** - System architecture & multi-tenant design
- **[Developer's Guide](./docs/DEVELOPERS_GUIDE.md)** - Step-by-step integration guide
- **[SDK Reference](./velumx/sdk/README.md)** - SDK API documentation
- **[Relayer Wallet Export](./velumx/dashboard/README.md)** - How to manage your sponsorship funds

## Technology

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, PostgreSQL (Supabase)
- **Blockchain**: Stacks (Clarity), Ethereum (Solidity)
- **Auth**: Supabase Auth (Email + GitHub OAuth)

## Supported Fee Tokens

VelumX accepts ANY SIP-010 token for gas fees. Popular options include:

- **USDCx** - Bridged USDC stablecoin
- **sBTC** - Bitcoin on Stacks
- **ALEX** - Native DeFi token
- **STX** - Native Stacks token
- **Any SIP-010 Token** - Custom tokens supported

The paymaster contract uses the `<sip-010-trait>` parameter, making it compatible with any compliant token without requiring contract modifications.

## Deployed Contracts (Testnet)

**Simple Paymaster**
```
STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.simple-paymaster-v1
```

**USDCx Token**
```
ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx
```

**sBTC Token**
```
SM3KNVZS30WM7F89SXKVVFY4SN9RMPZZ9FX929N0V.sbtc
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
