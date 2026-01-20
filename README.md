# VelumX

A gasless transaction platform for Stacks blockchain, enabling users to pay transaction fees using USDCx instead of STX.

## Features

- **Gasless Transactions**: Users can transact without holding STX
- **Cross-Chain Bridge**: Bridge USDC from Ethereum to USDCx on Stacks
- **Economic Abstraction**: Pay fees in stablecoins via Paymaster contract
- **Yield Strategies**: Deposit USDCx to earn yield (coming soon)

## Project Structure

```
VelumX/
├── frontend/          # Next.js web application
├── backend/           # Relayer service for sponsored transactions
└── stacks-contracts/  # Clarity smart contracts
```

## Smart Contracts

### Paymaster (`stacks-contracts/contracts/paymaster.clar`)
Handles fee settlement between users (who pay in USDCx) and the relayer (who pays STX gas).

## Getting Started

### Prerequisites
- Node.js v18+
- Clarinet (for smart contract development)
- Stacks wallet (Xverse or Hiro)

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Backend (Relayer)
```bash
cd backend
npm install
node server.js
```

### Smart Contracts
```bash
cd stacks-contracts
clarinet check
clarinet test
```

## Testnet Deployment

Contract Owner: `STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P`

## License

MIT
