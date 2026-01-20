# USDC Bridge Platform - Setup Guide

## Project Structure

```
.
├── backend/              # Node.js/TypeScript backend service
│   ├── src/
│   │   ├── config/      # Configuration management
│   │   ├── middleware/  # Express middleware
│   │   ├── utils/       # Utility functions
│   │   └── index.ts     # Main entry point
│   ├── logs/            # Log files
│   └── .env.example     # Environment template
├── frontend/            # Next.js frontend application
│   ├── app/            # Next.js app router
│   ├── lib/            # Frontend utilities
│   └── .env.local.example
├── shared/              # Shared types and utilities
│   ├── types/          # TypeScript type definitions
│   └── utils/          # Shared utility functions
└── stacks-contracts/    # Clarity smart contracts
```

## Prerequisites

- Node.js 18+ and npm
- MetaMask wallet (for Ethereum)
- Leather or Hiro wallet (for Stacks)
- Sepolia testnet ETH and USDC
- Stacks testnet STX

## Backend Setup

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and fill in required values:
   - `RELAYER_PRIVATE_KEY`: Your relayer's private key
   - `RELAYER_STACKS_ADDRESS`: Your relayer's Stacks address
   - Other values have sensible defaults for testnet

4. **Run in development mode:**
   ```bash
   npm run dev
   ```

5. **Build for production:**
   ```bash
   npm run build
   npm start
   ```

## Frontend Setup

1. **Navigate to frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.local.example .env.local
   ```
   
   Edit `.env.local` if needed (defaults work for testnet)

4. **Run development server:**
   ```bash
   npm run dev
   ```

5. **Build for production:**
   ```bash
   npm run build
   npm start
   ```

## Environment Variables

### Backend Required Variables

- `ETHEREUM_RPC_URL`: Ethereum Sepolia RPC endpoint
- `RELAYER_PRIVATE_KEY`: Private key for relayer account (keep secret!)
- `RELAYER_STACKS_ADDRESS`: Stacks address for relayer

### Backend Optional Variables

All other variables have defaults suitable for testnet. See `backend/.env.example` for full list.

### Frontend Variables

All frontend variables are optional and have testnet defaults. See `frontend/.env.local.example`.

## Getting Testnet Tokens

### Ethereum Sepolia

1. Get Sepolia ETH from faucet: https://sepoliafaucet.com/
2. Get Sepolia USDC from Circle faucet: https://faucet.circle.com/

### Stacks Testnet

1. Get testnet STX from faucet: https://explorer.hiro.so/sandbox/faucet?chain=testnet

## Development Workflow

1. Start backend: `cd backend && npm run dev`
2. Start frontend: `cd frontend && npm run dev`
3. Open browser: http://localhost:3000
4. Connect wallets and start bridging!

## Testing

Tests will be added as we implement features. Each component will have:
- Unit tests for specific functionality
- Property-based tests for correctness properties

## Troubleshooting

### Backend won't start

- Check that all required environment variables are set
- Ensure logs directory exists: `mkdir -p backend/logs`
- Check that port 3001 is not in use

### Frontend won't connect to backend

- Ensure backend is running on port 3001
- Check CORS settings in backend `.env`
- Verify `NEXT_PUBLIC_BACKEND_URL` in frontend `.env.local`

### Wallet connection issues

- Ensure you're on the correct network (Sepolia for Ethereum, Testnet for Stacks)
- Check that wallet extensions are installed and unlocked
- Try refreshing the page

## Next Steps

Follow the implementation tasks in `.kiro/specs/usdcx-bridge-platform/tasks.md` to build out the full platform.

## Security Notes

- Never commit `.env` files to version control
- Keep private keys secure
- Use separate accounts for testnet and mainnet
- Review all transactions before signing
