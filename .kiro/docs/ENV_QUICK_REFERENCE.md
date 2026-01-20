# Environment Variables Quick Reference

Quick reference guide for all environment variables in the USDC Bridge Platform.

## Backend Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| **Network** |
| `ETHEREUM_RPC_URL` | ✅ | - | Ethereum RPC endpoint |
| `STACKS_RPC_URL` | ✅ | - | Stacks RPC endpoint |
| **Contracts** |
| `ETHEREUM_USDC_ADDRESS` | ✅ | - | Ethereum USDC token address |
| `ETHEREUM_XRESERVE_ADDRESS` | ✅ | - | xReserve protocol address |
| `STACKS_USDCX_ADDRESS` | ✅ | - | Stacks USDCx token address |
| `STACKS_USDCX_PROTOCOL_ADDRESS` | ✅ | - | USDCx protocol address |
| `STACKS_PAYMASTER_ADDRESS` | ✅ | - | Paymaster contract address |
| **API Keys** |
| `CIRCLE_API_KEY` | ⚠️ | - | Circle API key (required for mainnet) |
| **Relayer** |
| `RELAYER_PRIVATE_KEY` | ✅ | - | Relayer private key (64 hex chars) |
| `RELAYER_STACKS_ADDRESS` | ✅ | - | Relayer Stacks address |
| `RELAYER_SEED_PHRASE` | ✅ | - | Relayer seed phrase (12/24 words) |
| `MIN_STX_BALANCE` | ❌ | 10000000 | Min STX balance (micro STX) |
| **Monitoring** |
| `ATTESTATION_POLL_INTERVAL` | ❌ | 30000 | Attestation poll interval (ms) |
| `MAX_RETRIES` | ❌ | 3 | Max transaction retry attempts |
| `TRANSACTION_TIMEOUT` | ❌ | 3600000 | Transaction timeout (ms) |
| **Fees** |
| `PAYMASTER_MARKUP` | ❌ | 5 | Paymaster fee markup (%) |
| **Rate Limiting** |
| `MAX_REQUESTS_PER_MINUTE` | ❌ | 100 | Max requests per minute per IP |
| **Server** |
| `PORT` | ❌ | 3001 | Backend server port |
| `CORS_ORIGIN` | ✅ | - | Frontend URL for CORS |
| **Logging** |
| `LOG_LEVEL` | ❌ | info | Log level (error/warn/info/debug) |
| `NODE_ENV` | ❌ | development | Node environment |

## Frontend Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| **Backend** |
| `NEXT_PUBLIC_BACKEND_URL` | ✅ | - | Backend API URL |
| **Network** |
| `NEXT_PUBLIC_ETHEREUM_CHAIN_ID` | ✅ | - | Ethereum chain ID |
| `NEXT_PUBLIC_STACKS_NETWORK` | ✅ | - | Stacks network (testnet/mainnet) |
| **Contracts** |
| `NEXT_PUBLIC_ETHEREUM_USDC_ADDRESS` | ✅ | - | Ethereum USDC address |
| `NEXT_PUBLIC_ETHEREUM_XRESERVE_ADDRESS` | ✅ | - | xReserve address |
| `NEXT_PUBLIC_STACKS_USDCX_ADDRESS` | ✅ | - | Stacks USDCx address |
| `NEXT_PUBLIC_STACKS_USDCX_PROTOCOL_ADDRESS` | ✅ | - | USDCx protocol address |
| `NEXT_PUBLIC_STACKS_PAYMASTER_ADDRESS` | ✅ | - | Paymaster address |
| **Domain IDs** |
| `NEXT_PUBLIC_ETHEREUM_DOMAIN_ID` | ✅ | - | Ethereum domain ID (always 0) |
| `NEXT_PUBLIC_STACKS_DOMAIN_ID` | ✅ | - | Stacks domain ID |
| **Explorers** |
| `NEXT_PUBLIC_ETHEREUM_EXPLORER_URL` | ✅ | - | Ethereum explorer URL |
| `NEXT_PUBLIC_STACKS_EXPLORER_URL` | ✅ | - | Stacks explorer URL |
| **Features** |
| `NEXT_PUBLIC_ENABLE_GASLESS` | ❌ | true | Enable gasless transactions |
| `NEXT_PUBLIC_ENABLE_YIELD` | ❌ | true | Enable yield farming |
| `NEXT_PUBLIC_ENABLE_HISTORY` | ❌ | true | Enable transaction history |
| **UI** |
| `NEXT_PUBLIC_APP_NAME` | ❌ | VelumX Bridge | Application name |
| `NEXT_PUBLIC_NETWORK_ENV` | ✅ | - | Network environment badge |
| `NEXT_PUBLIC_DEBUG_MODE` | ❌ | false | Enable debug mode |

## Testnet Values

### Backend (Sepolia + Stacks Testnet)

```bash
ETHEREUM_RPC_URL=https://ethereum-sepolia.publicnode.com
STACKS_RPC_URL=https://api.testnet.hiro.so
ETHEREUM_USDC_ADDRESS=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
ETHEREUM_XRESERVE_ADDRESS=0x008888878f94C0d87defdf0B07f46B93C1934442
STACKS_USDCX_ADDRESS=ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx
STACKS_USDCX_PROTOCOL_ADDRESS=ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx-v1
STACKS_PAYMASTER_ADDRESS=STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.paymaster-v3
```

### Frontend (Sepolia + Stacks Testnet)

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_ETHEREUM_CHAIN_ID=11155111
NEXT_PUBLIC_STACKS_NETWORK=testnet
NEXT_PUBLIC_ETHEREUM_DOMAIN_ID=0
NEXT_PUBLIC_STACKS_DOMAIN_ID=10003
NEXT_PUBLIC_ETHEREUM_EXPLORER_URL=https://sepolia.etherscan.io
NEXT_PUBLIC_STACKS_EXPLORER_URL=https://explorer.hiro.so
NEXT_PUBLIC_NETWORK_ENV=testnet
```

## Mainnet Values

### Backend (Ethereum + Stacks Mainnet)

```bash
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/YOUR_KEY
STACKS_RPC_URL=https://api.mainnet.hiro.so
ETHEREUM_USDC_ADDRESS=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
ETHEREUM_XRESERVE_ADDRESS=TO_BE_DEPLOYED
STACKS_USDCX_ADDRESS=TO_BE_DEPLOYED.usdcx
STACKS_USDCX_PROTOCOL_ADDRESS=TO_BE_DEPLOYED.usdcx-v1
STACKS_PAYMASTER_ADDRESS=TO_BE_DEPLOYED.paymaster-v3
NODE_ENV=production
```

### Frontend (Ethereum + Stacks Mainnet)

```bash
NEXT_PUBLIC_BACKEND_URL=https://api.yourdomain.com
NEXT_PUBLIC_ETHEREUM_CHAIN_ID=1
NEXT_PUBLIC_STACKS_NETWORK=mainnet
NEXT_PUBLIC_ETHEREUM_DOMAIN_ID=0
NEXT_PUBLIC_STACKS_DOMAIN_ID=10003
NEXT_PUBLIC_ETHEREUM_EXPLORER_URL=https://etherscan.io
NEXT_PUBLIC_STACKS_EXPLORER_URL=https://explorer.hiro.so
NEXT_PUBLIC_NETWORK_ENV=mainnet
NEXT_PUBLIC_DEBUG_MODE=false
```

## Quick Setup

### Testnet Development

```bash
# Backend
cd backend
cp .env.testnet .env
# Edit .env: Add RELAYER_PRIVATE_KEY, RELAYER_STACKS_ADDRESS, RELAYER_SEED_PHRASE
npm run dev

# Frontend
cd frontend
cp .env.testnet .env.local
npm run dev
```

### Mainnet Deployment

```bash
# Backend
cd backend
cp .env.mainnet .env
# Edit .env: Update ALL contract addresses and credentials
npm run build
npm start

# Frontend
cd frontend
cp .env.mainnet .env.local
# Edit .env.local: Update ALL contract addresses and URLs
npm run build
```

## Common Issues

| Issue | Solution |
|-------|----------|
| Backend won't start | Check all required variables are set |
| CORS error | Verify `CORS_ORIGIN` matches frontend URL |
| Wrong network | Check chain IDs and network settings |
| Insufficient balance | Fund relayer account with STX |
| Attestation timeout | Increase `TRANSACTION_TIMEOUT` |

## Security Checklist

- [ ] Never commit `.env` or `.env.local` files
- [ ] Use different credentials for testnet and mainnet
- [ ] Store production keys in secure vault (AWS Secrets Manager, etc.)
- [ ] Rotate keys every 90 days
- [ ] Monitor relayer balance 24/7
- [ ] Use HTTPS for all production URLs
- [ ] Set `NODE_ENV=production` for mainnet
- [ ] Set `NEXT_PUBLIC_DEBUG_MODE=false` for mainnet

## Getting Testnet Tokens

- **Sepolia ETH**: https://sepoliafaucet.com/
- **Sepolia USDC**: Circle testnet faucet
- **Stacks STX**: https://explorer.hiro.so/sandbox/faucet?chain=testnet

## Resources

- Full documentation: [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md)
- Setup guide: [README.md](../README.md)
- Deployment checklist: [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)
