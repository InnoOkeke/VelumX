# Environment Variables Documentation

This document provides comprehensive documentation for all environment variables used in the USDC Bridge Platform.

## Table of Contents

- [Overview](#overview)
- [Backend Environment Variables](#backend-environment-variables)
- [Frontend Environment Variables](#frontend-environment-variables)
- [Environment Files](#environment-files)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

The USDC Bridge Platform uses environment variables to configure both backend and frontend components for different deployment environments (testnet and mainnet). This approach provides:

- **Separation of concerns**: Different configurations for development, testnet, and production
- **Security**: Sensitive credentials are never committed to version control
- **Flexibility**: Easy configuration changes without code modifications
- **Portability**: Simple deployment across different environments

## Backend Environment Variables

### Network Configuration

#### `ETHEREUM_RPC_URL`
- **Type**: String (URL)
- **Required**: Yes
- **Description**: Ethereum RPC endpoint for blockchain interactions
- **Testnet**: `https://ethereum-sepolia.publicnode.com` or `https://sepolia.infura.io/v3/YOUR_KEY`
- **Mainnet**: `https://mainnet.infura.io/v3/YOUR_KEY` or `https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY`
- **Notes**: Use reliable paid providers (Infura, Alchemy) for production. Public nodes are unreliable.

#### `STACKS_RPC_URL`
- **Type**: String (URL)
- **Required**: Yes
- **Description**: Stacks RPC endpoint for blockchain interactions
- **Testnet**: `https://api.testnet.hiro.so`
- **Mainnet**: `https://api.mainnet.hiro.so`
- **Notes**: Hiro provides reliable public endpoints. Consider running your own node for production.

### Contract Addresses

#### `ETHEREUM_USDC_ADDRESS`
- **Type**: String (Ethereum address)
- **Required**: Yes
- **Description**: Ethereum USDC token contract address
- **Testnet**: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` (Sepolia)
- **Mainnet**: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`
- **Validation**: Must be a valid Ethereum address (0x + 40 hex characters)

#### `ETHEREUM_XRESERVE_ADDRESS`
- **Type**: String (Ethereum address)
- **Required**: Yes
- **Description**: Circle's xReserve protocol contract address
- **Testnet**: `0x008888878f94C0d87defdf0B07f46B93C1934442` (Sepolia)
- **Mainnet**: Contact Circle for mainnet address
- **Validation**: Must be a valid Ethereum address

#### `STACKS_USDCX_ADDRESS`
- **Type**: String (Stacks contract identifier)
- **Required**: Yes
- **Description**: USDCx token contract on Stacks
- **Testnet**: `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx`
- **Mainnet**: Deploy and update with your mainnet address
- **Format**: `{address}.{contract-name}`
- **Validation**: Must be a valid Stacks contract identifier

#### `STACKS_USDCX_PROTOCOL_ADDRESS`
- **Type**: String (Stacks contract identifier)
- **Required**: Yes
- **Description**: USDCx protocol contract that handles minting and burning
- **Testnet**: `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx-v1`
- **Mainnet**: Deploy and update with your mainnet address
- **Format**: `{address}.{contract-name}`

#### `STACKS_PAYMASTER_ADDRESS`
- **Type**: String (Stacks contract identifier)
- **Required**: Yes (if using gasless transactions)
- **Description**: Paymaster contract for gasless transactions
- **Testnet**: `STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P.paymaster-v3`
- **Mainnet**: Deploy and update with your mainnet address
- **Format**: `{address}.{contract-name}`

### API Keys

#### `CIRCLE_API_KEY`
- **Type**: String
- **Required**: No (testnet), Yes (mainnet)
- **Description**: Circle API key for fetching attestations
- **How to obtain**: Register at https://developers.circle.com/
- **Notes**: 
  - Optional for testnet (may have rate limits)
  - Required for production (higher rate limits and SLA)
  - Keep this secret and never commit to git

### Relayer Configuration

⚠️ **CRITICAL SECURITY WARNING**: These variables control accounts with real funds. Protect them with maximum security.

#### `RELAYER_PRIVATE_KEY`
- **Type**: String (64 hex characters)
- **Required**: Yes
- **Description**: Private key of the relayer account that pays gas fees
- **Format**: 64 hexadecimal characters (no 0x prefix)
- **Security**: 
  - NEVER commit to version control
  - Use secure key management (AWS Secrets Manager, HashiCorp Vault)
  - Implement key rotation policies
  - Monitor account activity 24/7
- **Example**: `your_64_character_hex_private_key_here` (NEVER use real keys in examples)

#### `RELAYER_STACKS_ADDRESS`
- **Type**: String (Stacks address)
- **Required**: Yes
- **Description**: Stacks address corresponding to the relayer private key
- **Testnet format**: Starts with `ST`
- **Mainnet format**: Starts with `SP`
- **Validation**: Must match the private key
- **Example**: `STKYNF473GQ1V0WWCF24TV7ZR1WYAKTC79V25E3P`

#### `RELAYER_SEED_PHRASE`
- **Type**: String (12 or 24 words)
- **Required**: Yes
- **Description**: Seed phrase for wallet recovery and transaction signing
- **Format**: 12 or 24 space-separated words
- **Security**: Store in secure vault, never in plain text
- **Example**: `word1 word2 word3 ... word12` (NEVER use real seed phrases in examples)

#### `MIN_STX_BALANCE`
- **Type**: Number (micro STX)
- **Required**: No
- **Default**: `10000000` (10 STX for testnet)
- **Description**: Minimum STX balance threshold for alerts
- **Units**: Micro STX (1 STX = 1,000,000 micro STX)
- **Recommended**: 
  - Testnet: 10 STX = 10,000,000 micro STX
  - Mainnet: 100 STX = 100,000,000 micro STX

### Monitoring Configuration

#### `ATTESTATION_POLL_INTERVAL`
- **Type**: Number (milliseconds)
- **Required**: No
- **Default**: `30000` (30 seconds)
- **Description**: How often to poll for attestations
- **Range**: 15000-60000 (15-60 seconds)
- **Recommended**: 
  - Testnet: 30 seconds
  - Mainnet: 15-30 seconds

#### `MAX_RETRIES`
- **Type**: Number
- **Required**: No
- **Default**: `3`
- **Description**: Maximum retry attempts for failed transactions
- **Range**: 1-10
- **Recommended**: 
  - Testnet: 3 attempts
  - Mainnet: 5 attempts

#### `TRANSACTION_TIMEOUT`
- **Type**: Number (milliseconds)
- **Required**: No
- **Default**: `3600000` (1 hour)
- **Description**: Maximum time to wait before alerting on pending transactions
- **Range**: 1800000-7200000 (30 minutes - 2 hours)
- **Recommended**: 
  - Testnet: 1 hour = 3,600,000 ms
  - Mainnet: 2 hours = 7,200,000 ms

### Fee Configuration

#### `PAYMASTER_MARKUP`
- **Type**: Number (percentage)
- **Required**: No
- **Default**: `5`
- **Description**: Markup percentage added to gas fees for relayer service
- **Range**: 0-20
- **Example**: `5` = 5% markup
- **Notes**: This covers operational costs and provides revenue

### Rate Limiting

#### `MAX_REQUESTS_PER_MINUTE`
- **Type**: Number
- **Required**: No
- **Default**: `100`
- **Description**: Maximum API requests per minute per IP address
- **Range**: 10-10000
- **Recommended**: 
  - Development: 100
  - Production: 1000+

### Server Configuration

#### `PORT`
- **Type**: Number
- **Required**: No
- **Default**: `3001`
- **Description**: Backend server port
- **Range**: 1024-65535
- **Notes**: Use reverse proxy (nginx) in production

#### `CORS_ORIGIN`
- **Type**: String (URL)
- **Required**: Yes
- **Description**: Frontend URL allowed to make requests
- **Testnet**: `http://localhost:3000`
- **Mainnet**: `https://your-production-domain.com`
- **Notes**: Must match your frontend URL exactly

### Logging Configuration

#### `LOG_LEVEL`
- **Type**: String
- **Required**: No
- **Default**: `info`
- **Description**: Logging verbosity level
- **Options**: `error`, `warn`, `info`, `debug`, `verbose`
- **Recommended**: 
  - Development: `debug`
  - Production: `info` or `warn`

#### `NODE_ENV`
- **Type**: String
- **Required**: No
- **Default**: `development`
- **Description**: Node.js environment
- **Options**: `development`, `production`, `test`
- **Notes**: Must be `production` for mainnet

## Frontend Environment Variables

All frontend environment variables must be prefixed with `NEXT_PUBLIC_` to be accessible in the browser.

### Backend API

#### `NEXT_PUBLIC_BACKEND_URL`
- **Type**: String (URL)
- **Required**: Yes
- **Description**: Backend API server URL
- **Testnet**: `http://localhost:3001`
- **Mainnet**: `https://api.yourdomain.com`
- **Notes**: Must use HTTPS in production

### Network Configuration

#### `NEXT_PUBLIC_ETHEREUM_CHAIN_ID`
- **Type**: Number
- **Required**: Yes
- **Description**: Ethereum chain ID
- **Testnet**: `11155111` (Sepolia)
- **Mainnet**: `1` (Ethereum mainnet)

#### `NEXT_PUBLIC_STACKS_NETWORK`
- **Type**: String
- **Required**: Yes
- **Description**: Stacks network identifier
- **Options**: `testnet`, `mainnet`
- **Validation**: Must match backend configuration

### Contract Addresses

Frontend contract addresses mirror backend addresses but with `NEXT_PUBLIC_` prefix:

- `NEXT_PUBLIC_ETHEREUM_USDC_ADDRESS`
- `NEXT_PUBLIC_ETHEREUM_XRESERVE_ADDRESS`
- `NEXT_PUBLIC_STACKS_USDCX_ADDRESS`
- `NEXT_PUBLIC_STACKS_USDCX_PROTOCOL_ADDRESS`
- `NEXT_PUBLIC_STACKS_PAYMASTER_ADDRESS`

See backend contract address documentation above for details.

### Domain IDs

#### `NEXT_PUBLIC_ETHEREUM_DOMAIN_ID`
- **Type**: Number
- **Required**: Yes
- **Description**: Ethereum domain ID for xReserve protocol
- **Value**: `0` (always 0 for Ethereum)

#### `NEXT_PUBLIC_STACKS_DOMAIN_ID`
- **Type**: Number
- **Required**: Yes
- **Description**: Stacks domain ID for xReserve protocol
- **Testnet**: `10003`
- **Mainnet**: Verify with Circle (may differ)

### Explorer URLs

#### `NEXT_PUBLIC_ETHEREUM_EXPLORER_URL`
- **Type**: String (URL)
- **Required**: Yes
- **Description**: Ethereum blockchain explorer base URL
- **Testnet**: `https://sepolia.etherscan.io`
- **Mainnet**: `https://etherscan.io`

#### `NEXT_PUBLIC_STACKS_EXPLORER_URL`
- **Type**: String (URL)
- **Required**: Yes
- **Description**: Stacks blockchain explorer base URL
- **Value**: `https://explorer.hiro.so` (works for both testnet and mainnet)

### Feature Flags

#### `NEXT_PUBLIC_ENABLE_GASLESS`
- **Type**: Boolean
- **Required**: No
- **Default**: `true`
- **Description**: Enable gasless transaction feature

#### `NEXT_PUBLIC_ENABLE_YIELD`
- **Type**: Boolean
- **Required**: No
- **Default**: `true`
- **Description**: Enable yield farming features

#### `NEXT_PUBLIC_ENABLE_HISTORY`
- **Type**: Boolean
- **Required**: No
- **Default**: `true`
- **Description**: Enable transaction history feature

### UI Configuration

#### `NEXT_PUBLIC_APP_NAME`
- **Type**: String
- **Required**: No
- **Default**: `VelumX Bridge`
- **Description**: Application name displayed in UI

#### `NEXT_PUBLIC_NETWORK_ENV`
- **Type**: String
- **Required**: Yes
- **Description**: Network environment badge shown in UI
- **Options**: `testnet`, `mainnet`
- **Notes**: Helps users identify which network they're using

#### `NEXT_PUBLIC_DEBUG_MODE`
- **Type**: Boolean
- **Required**: No
- **Default**: `false`
- **Description**: Enable debug mode with additional UI information
- **Recommended**: 
  - Development: `true`
  - Production: `false`

## Environment Files

### File Structure

```
project-root/
├── backend/
│   ├── .env                    # Active configuration (gitignored)
│   ├── .env.example           # Template with placeholders
│   ├── .env.testnet           # Testnet configuration
│   └── .env.mainnet           # Mainnet configuration template
└── frontend/
    ├── .env.local             # Active configuration (gitignored)
    ├── .env.local.example     # Template with placeholders
    ├── .env.testnet           # Testnet configuration
    └── .env.mainnet           # Mainnet configuration template
```

### Setup Instructions

#### For Testnet Development

**Backend:**
```bash
cd backend
cp .env.testnet .env
# Edit .env and fill in:
# - RELAYER_PRIVATE_KEY
# - RELAYER_STACKS_ADDRESS
# - RELAYER_SEED_PHRASE
# - (Optional) CIRCLE_API_KEY
```

**Frontend:**
```bash
cd frontend
cp .env.testnet .env.local
# Edit .env.local if needed (usually works as-is for local development)
```

#### For Mainnet Deployment

**Backend:**
```bash
cd backend
cp .env.mainnet .env
# Edit .env and update ALL values:
# - All contract addresses (replace TO_BE_DEPLOYED)
# - ETHEREUM_RPC_URL with production endpoint
# - CIRCLE_API_KEY with production key
# - RELAYER_* values with production credentials
# - CORS_ORIGIN with production domain
# - Set NODE_ENV=production
```

**Frontend:**
```bash
cd frontend
cp .env.mainnet .env.local
# Edit .env.local and update ALL values:
# - All contract addresses (replace TO_BE_DEPLOYED)
# - NEXT_PUBLIC_BACKEND_URL with production backend
# - Set NEXT_PUBLIC_NETWORK_ENV=mainnet
# - Set NEXT_PUBLIC_DEBUG_MODE=false
```

### Validation

The backend validates all required environment variables on startup. If any are missing or invalid, the service will fail to start with a descriptive error message.

To test your configuration:
```bash
cd backend
npm run dev
# Look for: "Backend service started successfully"
```

## Security Best Practices

### 1. Never Commit Secrets

- `.env` and `.env.local` files are in `.gitignore`
- Never commit files containing real credentials
- Use `.env.example` files as templates with placeholders

### 2. Use Secure Key Management

For production:
- **AWS**: Use AWS Secrets Manager or Parameter Store
- **Azure**: Use Azure Key Vault
- **GCP**: Use Google Secret Manager
- **Self-hosted**: Use HashiCorp Vault

### 3. Implement Key Rotation

- Rotate relayer private keys every 90 days
- Update API keys regularly
- Document rotation procedures

### 4. Monitor Account Activity

- Set up alerts for relayer balance
- Monitor for suspicious transactions
- Log all critical operations

### 5. Principle of Least Privilege

- Relayer account should only have necessary permissions
- Use separate accounts for different environments
- Implement multi-signature for critical operations

### 6. Environment Separation

- Use completely separate credentials for testnet and mainnet
- Never use testnet keys in production
- Test thoroughly on testnet before mainnet deployment

## Troubleshooting

### Backend Won't Start

**Error**: "Missing required environment variable: RELAYER_PRIVATE_KEY"
- **Solution**: Ensure all required variables are set in `.env`
- **Check**: Run `cat .env | grep RELAYER_PRIVATE_KEY`

**Error**: "Invalid Ethereum RPC URL"
- **Solution**: Verify URL format and API key
- **Test**: `curl https://sepolia.infura.io/v3/YOUR_KEY`

### Frontend Can't Connect to Backend

**Error**: CORS error in browser console
- **Solution**: Verify `CORS_ORIGIN` in backend `.env` matches frontend URL
- **Check**: Backend logs for CORS configuration

**Error**: "Network Error" when calling API
- **Solution**: Verify `NEXT_PUBLIC_BACKEND_URL` is correct
- **Test**: `curl http://localhost:3001/api/health`

### Wallet Connection Issues

**Error**: "Wrong network" message
- **Solution**: Verify chain IDs match wallet network
- **Check**: `NEXT_PUBLIC_ETHEREUM_CHAIN_ID` and `NEXT_PUBLIC_STACKS_NETWORK`

### Transaction Failures

**Error**: "Insufficient STX balance"
- **Solution**: Fund relayer account with more STX
- **Check**: `MIN_STX_BALANCE` setting

**Error**: "Attestation timeout"
- **Solution**: Increase `TRANSACTION_TIMEOUT` or check Circle API status
- **Check**: Circle API health and `CIRCLE_API_KEY`

### Getting Help

1. Check logs: `npm run dev` shows detailed error messages
2. Verify configuration: Compare your `.env` with `.env.example`
3. Test connectivity: Use `curl` to test RPC endpoints
4. Review documentation: See README.md and other docs
5. Report issues: Create issue with error logs and configuration (redact secrets!)

## Additional Resources

- [Circle xReserve Documentation](https://developers.circle.com/)
- [Stacks Documentation](https://docs.stacks.co/)
- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
