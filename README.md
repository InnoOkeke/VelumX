# VelumX - Gas-Abstraction Protocol for Bitcoin L2

<div align="center">
  <img src="frontend/public/velumx-logo.svg" alt="VelumX Logo" width="200"/>
  
  <h3>Making USDCx Truly Native on Stacks</h3>
  
  <p>
    <strong>VelumX</strong> is a Gas-Abstraction protocol designed to turn bridged USDCx into a truly native, frictionless asset on the Stacks (Bitcoin L2) ecosystem.
  </p>

  <p>
    <a href="#features">Features</a> •
    <a href="#how-it-works">How It Works</a> •
    <a href="#quick-start">Quick Start</a> •
    <a href="#documentation">Documentation</a>
  </p>
</div>

---

## 🎯 The Problem

When users bridge USDC to Stacks as USDCx, they face a critical UX barrier: **they need STX tokens to pay for gas fees**. This creates friction:

- New users must acquire STX before using their USDCx
- Extra steps and complexity
- Poor onboarding experience
- Limits DeFi adoption on Stacks

## ✨ The VelumX Solution

**VelumX eliminates gas fees entirely** by implementing a gas-abstraction layer that allows users to:

✅ **Pay fees in USDCx** instead of STX  
✅ **Bridge USDC** from Ethereum to Stacks  
✅ **Swap tokens** on VelumX AMM  
✅ **Transact freely** without holding STX  
✅ **Onboard instantly** - no native token needed  

### Core Innovation: Paymaster Pattern

VelumX uses a **Paymaster smart contract** that:
1. Accepts USDCx as payment for transaction fees
2. Sponsors transactions with STX on behalf of users
3. Enables truly gasless UX for all operations

---

## 🌟 Features

### 1. **Gasless Transactions** ⚡
- Pay all fees in USDCx
- No STX required for any operation
- Seamless user experience
- Backend relayer sponsors transactions

### 2. **Cross-Chain Bridge** 🌉
- Bridge USDC from Ethereum Sepolia to Stacks
- Withdraw USDCx back to Ethereum
- Powered by Circle's xReserve protocol
- Real-time transaction monitoring

### 3. **Token Swaps** 🔄
- Swap USDCx for STX, VelumX, or other tokens
- Integrated with VelumX AMM
- Smart routing (direct & multi-hop)
- All swaps are gasless

### 4. **Multi-Wallet Support** 👛
- **Ethereum:** Rabby, MetaMask
- **Stacks:** Xverse, Leather, Hiro
- Automatic network verification
- Real-time balance updates

### 5. **Transaction Monitoring** 📊
- Real-time status tracking
- Attestation handling
- Transaction history
- Explorer links
RELAYER_PRIVATE_KEY=00f64ff818f481b7fcc4d72fc1df37a02b6af4fb81deafc30e6d5d057bcf
---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        VelumX Platform                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Bridge     │    │     Swap     │    │   Paymaster  │  │
│  │              │    │  (Velar DEX) │    │              │  │
│  │ Ethereum ↔   │    │  USDCx → STX │    │  Fee in      │  │
│  │   Stacks     │    │  USDCx → Any │    │  USDCx       │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │          Paymaster Smart Contract (Stacks)            │  │
│  │  • Accepts USDCx for fees                             │  │
│  │  • Sponsors transactions with STX                     │  │
│  │  • Enables gasless bridge & swap operations           │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Backend Relayer Service                  │  │
│  │  • Monitors transactions                              │  │
│  │  • Fetches attestations                               │  │
│  │  • Sponsors user transactions                         │  │
│  │  • Manages STX balance                                │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

**Frontend:**
- Next.js 16 + React 19
- TypeScript
- Tailwind CSS
- Viem (Ethereum)
- Stacks.js (Stacks)

**Backend:**
- Node.js + Express
- TypeScript
- Winston (Logging)
- Persistent transaction queue

**Smart Contracts:**
- Clarity (Stacks)
- Paymaster pattern
- SIP-010 token standard

**Integrations:**
- Circle xReserve Protocol
- Velar DEX
- Stacks Attestation Service

---

## 🚀 How It Works

### Gasless Bridge (Ethereum → Stacks)

```
1. User deposits USDC on Ethereum
2. Circle issues attestation
3. VelumX mints USDCx on Stacks
4. User receives USDCx (no STX needed!)
```

### Gasless Withdrawal (Stacks → Ethereum)

```
1. User initiates withdrawal
2. Pays fee in USDCx (not STX!)
3. Paymaster sponsors transaction
4. USDCx burned, USDC released on Ethereum
```

### Gasless Swap

```
1. User selects tokens (e.g., USDCx → STX)
2. Gets real-time quote
3. Pays fee in USDCx
4. Paymaster sponsors swap on VelumX
5. User receives output tokens
```

---

## 📦 Quick Start

### Prerequisites
- Node.js 18+
- Ethereum wallet (Rabby or MetaMask)
- Stacks wallet (Xverse, Leather, or Hiro)

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/velumx.git
cd velumx

# Install dependencies
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### Configuration

1. **Backend Setup**
```bash
cd backend
cp .env.example .env
# Edit .env with your configuration
```

2. **Frontend Setup**
```bash
cd frontend
cp .env.local.example .env.local
# Edit .env.local with your configuration
```

3. **Fund Relayer** (Important!)
```bash
# Get testnet STX for relayer address
# Visit: https://explorer.hiro.so/sandbox/faucet?chain=testnet
# Address: STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P
```

### Run Application

```bash
# Terminal 1: Start Backend
cd backend
npm run dev

# Terminal 2: Start Frontend
cd frontend
npm run dev
```

Open http://localhost:3000

---

## 💡 Usage Examples

### 1. Bridge USDC to Stacks (Gasless)

```typescript
// User only needs USDC on Ethereum
// No STX required!

1. Connect Ethereum wallet
2. Connect Stacks wallet
3. Enter amount (e.g., 10 USDC)
4. Click "Bridge USDC"
5. Approve + Confirm
6. Receive USDCx on Stacks
```

### 2. Swap USDCx to STX (Gasless)

```typescript
// Pay fees in USDCx, not STX!

1. Go to "Swap" tab
2. Select: USDCx → STX
3. Enter amount
4. Enable "Gasless Mode"
5. Review quote
6. Click "Swap Tokens"
7. Confirm in wallet (no STX needed!)
```

### 3. Withdraw to Ethereum (Gasless)

```typescript
// Withdraw without holding STX

1. Switch direction to Stacks → Ethereum
2. Enter amount
3. Enable "Gasless Mode"
4. Pay fee in USDCx
5. Receive USDC on Ethereum
```

---

## 🎨 Key Components

### Paymaster Contract
**Location:** `stacks-contracts/contracts/paymaster.clar`

```clarity
;; Gasless withdrawal
(define-public (withdraw-gasless (amount uint) (fee uint) (recipient (buff 32)))
  ;; 1. User pays fee in USDCx
  ;; 2. Contract burns USDCx
  ;; 3. Transaction sponsored by relayer
)

;; Gasless swap
(define-public (swap-gasless (token-in <sip-010>) (token-out <sip-010>) ...)
  ;; 1. User pays fee in USDCx
  ;; 2. Execute swap on VelumX
  ;; 3. Transaction sponsored by relayer
)
```

### Paymaster Service
**Location:** `backend/src/services/PaymasterService.ts`

- Fetches exchange rates (STX/USD, USDC/USD)
- Calculates fees with configurable markup
- Validates user USDCx balance
- Sponsors transactions with relayer key
- Monitors relayer STX balance

### Swap Service
**Location:** `backend/src/services/SwapService.ts`

- Manages supported tokens
- Generates swap quotes
- Finds optimal routes
- Integrates with VelumX AMM

---

## 📚 Documentation

All documentation is located in `.kiro/docs/`:

- **[Quick Start Guide](./.kiro/docs/QUICK_START.md)** - Get started in 5 minutes
- **[Paymaster Integration](./.kiro/docs/PAYMASTER_INTEGRATION.md)** - Gasless transaction setup
- **[Swap Feature](./.kiro/docs/SWAP_FEATURE.md)** - Token swap documentation
- **[Deployment Checklist](./.kiro/docs/DEPLOYMENT_CHECKLIST.md)** - Complete deployment guide
- **[Security Guidelines](./SECURITY.md)** - Security best practices
- **[Environment Setup](./.kiro/docs/ENV_SETUP_GUIDE.md)** - Configuration guide

---

## 🔐 Security

VelumX implements multiple security layers:

- **Environment Variables:** All secrets in `.env` files
- **Input Validation:** Comprehensive validation on all endpoints
- **Rate Limiting:** Protection against abuse
- **Balance Monitoring:** Continuous relayer balance checks
- **Transaction Validation:** Pre-execution validation
- **Audit Ready:** Code structured for security audits

**⚠️ Testnet Warning:** Current deployment uses testnet credentials. Never use for mainnet!

See [SECURITY.md](./SECURITY.md) for detailed guidelines.

---

## 🌐 Deployed Contracts

### Testnet

**Paymaster Contract:**
- Address: `STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.paymaster-v3`
- Network: Stacks Testnet
- Explorer: [View Contract](https://explorer.hiro.so/txid/b51c675e0705a182b8e8949b36553d90b2479ffb91c10bc669e156c9a9d7738a?chain=testnet)

**USDCx Protocol:**
- Token: `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx`
- Protocol: `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx-v1`

**Ethereum Contracts (Sepolia):**
- USDC: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`
- xReserve: `0x008888878f94C0d87defdf0B07f46B93C1934442`

---

## 🎯 Roadmap

### Phase 1: MVP (Current) ✅
- [x] Paymaster contract deployment
- [x] Gasless bridge withdrawals
- [x] Gasless token swaps
- [x] Multi-wallet support
- [x] Transaction monitoring

### Phase 2: Enhancement 🚧
- [ ] Additional DEX integrations
- [ ] More token pairs
- [ ] Advanced routing algorithms
- [ ] Mobile optimization
- [ ] Analytics dashboard

### Phase 3: Mainnet 🔮
- [ ] Security audit
- [ ] Mainnet deployment
- [ ] Production monitoring
- [ ] Automated relayer funding
- [ ] Community governance

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please read [SECURITY.md](./SECURITY.md) before contributing.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Circle** - xReserve Protocol
- **Stacks** - Bitcoin L2 infrastructure
- **VelumX** - AMM integration
- **Hiro** - Development tools

---

## 📞 Support

- **Documentation:** `.kiro/docs/`
- **Issues:** [GitHub Issues](https://github.com/yourusername/velumx/issues)
- **Discord:** [Join Community](#)
- **Twitter:** [@VelumX](#)

---

<div align="center">
  <p>
    <strong>VelumX</strong> - Making USDCx Truly Native on Bitcoin L2
  </p>
  <p>
    Built with ❤️ for the Stacks ecosystem
  </p>
</div>
