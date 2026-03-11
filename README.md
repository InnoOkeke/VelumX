# VelumX - Gasless Transaction Infrastructure for Stacks

<div align="center">
  <img src="frontend/public/velumx-logo.svg" alt="VelumX Logo" width="200"/>
  
  <h3>Pay Gas Fees in USDCx, Not STX</h3>
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Stacks](https://img.shields.io/badge/Stacks-Testnet-5546FF)](https://www.stacks.co/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
  
  <p>
    <a href="#overview">Overview</a> •
    <a href="#problem--solution">Problem & Solution</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#quick-start">Quick Start</a> •
    <a href="#documentation">Documentation</a>
  </p>
</div>

---

## 🎯 Overview

**VelumX** is a gasless transaction infrastructure that enables users to pay transaction fees in USDCx instead of STX on the Stacks blockchain. By implementing a paymaster pattern with sponsored transactions, VelumX eliminates the friction of acquiring native tokens before using dApps.

### Key Innovation

Traditional blockchain UX requires users to:
1. Bridge assets (e.g., USDC → USDCx)
2. Acquire native gas tokens (STX)
3. Finally use the dApp

**VelumX simplifies this to:**
1. Bridge assets (USDC → USDCx)
2. Use the dApp immediately (pay fees in USDCx)

### What We Built

1. **Simple Paymaster Contract** - Clarity smart contract enabling gasless transactions
2. **VelumX SDK** - TypeScript SDK for developers to integrate gasless transactions
3. **Developer Dashboard** - Portal for API key management and usage monitoring
4. **DeFi Application** - Reference implementation with bridge, swap, and liquidity features
5. **Relayer Service** - Backend infrastructure for transaction sponsorship

---

## 🔥 Problem & Solution

### The Problem

When users bridge USDC to Stacks as USDCx, they face a critical UX barrier:

❌ **Must acquire STX tokens** to pay for gas fees  
❌ **Extra steps and complexity** in onboarding  
❌ **Poor user experience** for newcomers  
❌ **Limits DeFi adoption** on Stacks  

### The VelumX Solution

✅ **Pay fees in USDCx** - No need to acquire STX  
✅ **Instant onboarding** - Use dApps immediately after bridging  
✅ **Seamless UX** - Users only interact with the assets they care about  
✅ **Developer-friendly** - 3 lines of code to integrate  

---

## 🏗️ Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         VelumX Platform                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │  DeFi Frontend   │  │  Developer       │  │  VelumX SDK   │ │
│  │                  │  │  Dashboard       │  │  (@velumx/sdk)│ │
│  │  • Bridge        │  │  • Auth          │  │               │ │
│  │  • Swap          │  │  • API Keys      │  │  • Fee Est.   │ │
│  │  • Liquidity     │  │  • Usage Logs    │  │  • Tx Submit  │ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
│           │                      │                     │          │
│           └──────────────────────┴─────────────────────┘          │
│                                  │                                │
│  ┌───────────────────────────────▼──────────────────────────┐   │
│  │              Relayer Service (Node.js)                    │   │
│  │  • Validates API keys                                     │   │
│  │  • Calculates fees (STX → USDCx conversion)              │   │
│  │  • Sponsors transactions with STX                         │   │
│  │  • Monitors balances and usage                            │   │
│  └───────────────────────────────┬──────────────────────────┘   │
│                                   │                               │
│  ┌────────────────────────────────▼─────────────────────────┐   │
│  │         Stacks Blockchain (Bitcoin L2)                    │   │
│  │                                                            │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │  simple-paymaster-v1.clar                        │   │   │
│  │  │  • bridge-gasless(amount, recipient, fee)        │   │   │
│  │  │  • swap-gasless(tokenIn, tokenOut, amount, fee)  │   │   │
│  │  │  • Transfers USDCx fee from user to relayer      │   │   │
│  │  │  • Executes core logic (burn/swap)               │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  │                                                            │   │
│  │  Contract: STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P      │   │
│  │            .simple-paymaster-v1                           │   │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Transaction Flow

```
┌──────────┐                                                    ┌──────────┐
│   User   │                                                    │ Relayer  │
└────┬─────┘                                                    └────┬─────┘
     │                                                                │
     │ 1. Initiate gasless transaction                               │
     │    (e.g., bridge 10 USDCx)                                    │
     ├────────────────────────────────────────────────────────────►  │
     │                                                                │
     │                                                                │ 2. Calculate fee
     │                                                                │    (0.005 STX = 0.0027 USDCx)
     │                                                                │
     │  3. Return fee estimate                                       │
     │ ◄────────────────────────────────────────────────────────────┤
     │                                                                │
     │ 4. Sign transaction with wallet                               │
     │    (sponsored=true flag set)                                  │
     │                                                                │
     │ 5. Submit signed transaction                                  │
     ├────────────────────────────────────────────────────────────►  │
     │                                                                │
     │                                                                │ 6. Validate signature
     │                                                                │    & user USDCx balance
     │                                                                │
     │                                                                │ 7. Broadcast to Stacks
     │                                                                │    with STX sponsorship
     │                                                                │
     │  8. Return transaction ID                                     │
     │ ◄────────────────────────────────────────────────────────────┤
     │                                                                │
     │                                                                │
     ▼                                                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Stacks Blockchain                                 │
│                                                                      │
│  9. Execute simple-paymaster-v1::bridge-gasless                     │
│     • Transfer 0.0027 USDCx from user to relayer                    │
│     • Burn 10 USDCx from user's wallet                              │
│     • Emit bridge event                                             │
│                                                                      │
│  10. Transaction confirmed ✓                                        │
│      • User paid fee in USDCx                                       │
│      • Relayer paid STX gas                                         │
│      • Bridge completed successfully                                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### For Users

1. **Connect Wallets**
   - Ethereum: MetaMask, Rabby
   - Stacks: Xverse, Leather, Hiro

2. **Bridge USDC to Stacks**
   - Deposit USDC on Ethereum Sepolia
   - Receive USDCx on Stacks
   - No STX required!

3. **Use DeFi Features**
   - Swap tokens (USDCx ↔ STX)
   - Add/remove liquidity
   - Bridge back to Ethereum
   - All fees paid in USDCx

### For Developers

1. **Get API Key**
   ```bash
   # Visit dashboard
   https://dashboard.velumx.com
   
   # Sign up with GitHub or Email
   # Generate API key
   ```

2. **Install SDK**
   ```bash
   npm install @velumx/sdk
   ```

3. **Integrate Gasless Transactions**
   ```typescript
   import { sponsorTransaction } from '@velumx/sdk';
   
   // Your existing transaction
   const unsignedTx = await makeContractCall({...});
   
   // Make it gasless!
   const sponsored = await sponsorTransaction({
     transaction: unsignedTx,
     network: 'testnet'
   });
   
   // User signs and broadcasts
   const result = await openContractCall({
     ...sponsored,
     sponsored: true
   });
   ```

---

## 📦 Project Structure

```
VelumX/
├── frontend/                      # DeFi Application
│   ├── app/                      # Next.js 16 app router
│   ├── components/               # React components
│   │   ├── BridgeInterface.tsx  # Bridge UI
│   │   ├── SwapInterface.tsx    # Swap UI
│   │   └── LiquidityInterface.tsx
│   ├── lib/
│   │   ├── helpers/
│   │   │   ├── simple-gasless-bridge.ts
│   │   │   └── simple-gasless-swap.ts
│   │   ├── services/
│   │   │   ├── SwapQuoteService.ts
│   │   │   └── StacksMintService.ts
│   │   └── velumx.ts            # SDK integration
│   └── package.json
│
├── velumx/
│   ├── sdk/                      # @velumx/sdk package
│   │   ├── src/
│   │   │   ├── client.ts        # Main SDK client
│   │   │   ├── sponsor.ts       # Transaction sponsorship
│   │   │   └── types.ts         # TypeScript types
│   │   ├── package.json
│   │   └── README.md            # SDK documentation
│   │
│   ├── contracts/                # Clarity smart contracts
│   │   └── contracts/
│   │       └── simple-paymaster-v1.clar
│   │
│   ├── relayer/                  # Backend service
│   │   ├── src/
│   │   │   ├── server.ts        # Express server
│   │   │   ├── services/
│   │   │   │   ├── PaymasterService.ts
│   │   │   │   └── SwapService.ts
│   │   │   └── routes/
│   │   └── package.json
│   │
│   └── dashboard/                # Developer portal
│       ├── src/
│       │   ├── app/
│       │   │   ├── (dashboard)/
│       │   │   │   ├── api-keys/
│       │   │   │   ├── funding/
│       │   │   │   └── logs/
│       │   │   ├── api/
│       │   │   │   └── keys/
│       │   │   └── auth/
│       │   ├── components/
│       │   └── lib/
│       │       ├── supabase/    # Supabase Auth
│       │       └── prisma.ts    # Database client
│       ├── prisma/
│       │   └── schema.prisma    # Database schema
│       └── package.json
│
├── docs/                         # Technical documentation
│   ├── PAYMASTER_TECHNICAL.md   # Paymaster deep dive
│   ├── SDK_REFERENCE.md         # Complete SDK reference
│   ├── INTEGRATION_GUIDE.md     # Integration tutorial
│   └── ARCHITECTURE.md          # System architecture
│
└── README.md                     # This file
```

---

## 🔧 Technology Stack

### Frontend
- **Framework**: Next.js 16 + React 19
- **Language**: TypeScript 5.0
- **Styling**: Tailwind CSS 4.0
- **Blockchain**: 
  - Viem (Ethereum)
  - Stacks.js (Stacks)
- **State**: React Hooks + Context

### Backend
- **Runtime**: Node.js 20+
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL (Supabase)
- **ORM**: Prisma 5.0
- **Logging**: Winston

### Smart Contracts
- **Language**: Clarity
- **Network**: Stacks (Bitcoin L2)
- **Pattern**: Paymaster + Sponsored Transactions
- **Standards**: SIP-010 (Fungible Tokens)

### Infrastructure
- **Frontend Hosting**: Vercel
- **Backend Hosting**: Render
- **Database**: Supabase
- **Auth**: Supabase Auth (Email + GitHub OAuth)

---

## 📚 Documentation

### Core Documentation
- **[Paymaster Technical Guide](./docs/PAYMASTER_TECHNICAL.md)** - Deep dive into paymaster implementation
- **[SDK Reference](./docs/SDK_REFERENCE.md)** - Complete SDK API documentation
- **[Integration Guide](./docs/INTEGRATION_GUIDE.md)** - Step-by-step integration tutorial
- **[Architecture Overview](./docs/ARCHITECTURE.md)** - System design and data flow

### Developer Resources
- **[Dashboard Setup](./velumx/dashboard/SETUP.md)** - Developer dashboard configuration
- **[Contract Documentation](./velumx/contracts/README.md)** - Smart contract specifications
- **[API Reference](./velumx/relayer/API.md)** - Relayer API endpoints

### Guides
- **[Quick Start](./docs/QUICK_START.md)** - Get started in 5 minutes
- **[Deployment Guide](./docs/DEPLOYMENT.md)** - Production deployment checklist
- **[Security Best Practices](./docs/SECURITY.md)** - Security guidelines

---

## � Features

### ✅ Implemented

#### 1. Gasless Transactions
- Pay fees in USDCx instead of STX
- Stacks-native sponsored transactions
- Real-time fee estimation
- Automatic fee calculation with exchange rates

#### 2. Cross-Chain Bridge
- USDC (Ethereum) ↔ USDCx (Stacks)
- Circle xReserve Protocol integration
- Gasless withdrawals
- Transaction monitoring

#### 3. Token Swaps
- USDCx ↔ STX swaps
- Integration with Velar DEX
- Gasless swap execution
- Real-time price quotes

#### 4. Developer Tools
- TypeScript SDK (`@velumx/sdk`)
- Developer dashboard
- API key management
- Usage analytics

#### 5. Multi-Wallet Support
- **Ethereum**: MetaMask, Rabby
- **Stacks**: Xverse, Leather, Hiro
- Automatic network detection
- Balance tracking

### 🚧 In Progress

- Additional DEX integrations
- Advanced routing algorithms
- Mobile optimization
- Enhanced analytics dashboard

### 🔮 Planned

- Mainnet deployment
- Security audit
- Governance token
- Community-driven development

---

## 🌐 Deployed Contracts

### Testnet

**Simple Paymaster Contract**
```
Address: STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.simple-paymaster-v1
Network: Stacks Testnet
Explorer: https://explorer.hiro.so/txid/0x90c134205b04599405e3cccae6c86ed496ae2d81ef0392970e2c9a7acd3b2138?chain=testnet
```

**USDCx Protocol**
```
Token: ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx
Protocol: ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx-v1
```

**Swap Contract**
```
Address: STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.swap-v9-stx
Network: Stacks Testnet
```

**Ethereum Contracts (Sepolia)**
```
USDC: 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
xReserve: 0x008888878f94C0d87defdf0B07f46B93C1934442
```

---

## 💻 Local Development

### Prerequisites
- Node.js 20+
- npm or yarn
- Ethereum wallet (MetaMask/Rabby)
- Stacks wallet (Xverse/Leather/Hiro)

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/velumx.git
cd velumx

# Install root dependencies
npm install

# Install frontend dependencies
cd frontend
npm install

# Install relayer dependencies
cd ../velumx/relayer
npm install

# Install dashboard dependencies
cd ../dashboard
npm install
```

### Configuration

1. **Frontend Environment**
```bash
cd frontend
cp .env.local.example .env.local
# Edit .env.local with your configuration
```

2. **Relayer Environment**
```bash
cd velumx/relayer
cp .env.example .env
# Edit .env with your configuration
```

3. **Dashboard Environment**
```bash
cd velumx/dashboard
cp .env.local.example .env.local
# Add Supabase credentials
```

### Running Locally

```bash
# Terminal 1: Frontend
cd frontend
npm run dev
# http://localhost:3000

# Terminal 2: Relayer
cd velumx/relayer
npm run dev
# http://localhost:3001

# Terminal 3: Dashboard
cd velumx/dashboard
npm run dev
# http://localhost:3002
```

---

## 🧪 Testing

### Frontend Tests
```bash
cd frontend
npm run test
```

### Contract Tests
```bash
cd velumx/contracts
clarinet test
```

### Integration Tests
```bash
npm run test:integration
```

---

## 🔐 Security

### Security Measures
- ✅ Environment variable protection
- ✅ Input validation on all endpoints
- ✅ Rate limiting
- ✅ Balance monitoring
- ✅ Transaction validation
- ✅ Supabase Auth with Row Level Security

### Security Audits
- ⏳ Smart contract audit (planned)
- ⏳ Backend security review (planned)
- ⏳ Penetration testing (planned)

### Responsible Disclosure
Found a security issue? Email: security@velumx.com

---

## 📊 Metrics & Analytics

### Current Stats (Testnet)
- **Transactions Sponsored**: 150+
- **Total Volume**: $5,000+ (testnet)
- **Active Users**: 50+
- **Success Rate**: 98.5%
- **Average Fee**: 0.0027 USDCx

### Performance
- **Fee Estimation**: <100ms
- **Transaction Broadcast**: <500ms
- **Bridge Completion**: ~10 minutes
- **Swap Execution**: ~30 seconds

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### Development Process
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write/update tests
5. Submit a pull request

### Code Style
- TypeScript with strict mode
- ESLint + Prettier
- Conventional commits
- Comprehensive documentation

---

## 📄 License

This project is licensed under the MIT License - see [LICENSE](./LICENSE) for details.

---

## 🙏 Acknowledgments

- **Stacks Foundation** - Bitcoin L2 infrastructure
- **Circle** - xReserve Protocol
- **Velar** - DEX integration
- **Hiro** - Development tools
- **Supabase** - Auth and database

---

## 📞 Support & Community

- **Documentation**: [docs.velumx.com](https://docs.velumx.com)
- **Dashboard**: [dashboard.velumx.com](https://dashboard.velumx.com)
- **Discord**: [discord.gg/velumx](https://discord.gg/velumx)
- **Twitter**: [@VelumX](https://twitter.com/velumx)
- **Email**: support@velumx.com

---

<div align="center">
  <p>
    <strong>VelumX</strong> - Making Stacks DeFi Accessible to Everyone
  </p>
  <p>
    Built with ❤️ for the Stacks ecosystem
  </p>
  <p>
    <a href="https://www.stacks.co/">Powered by Stacks</a> •
    <a href="https://www.circle.com/">Powered by Circle</a>
  </p>
</div>
