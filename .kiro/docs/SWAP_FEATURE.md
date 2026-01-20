# VelumX Gasless Token Swap Feature

## Overview

VelumX integrates with **Velar DEX** to enable gasless token swaps on Stacks. Users can swap USDCx for any supported token without holding STX for gas fees.

## Architecture

### Components

1. **Backend SwapService** (`backend/src/services/SwapService.ts`)
   - Integrates with Velar SDK for real-time pricing
   - Fetches supported tokens from Velar network
   - Generates swap quotes with price impact and routing
   - Validates user balances before swaps

2. **Swap API Routes** (`backend/src/routes/swap.ts`)
   - `GET /api/swap/tokens` - List supported tokens
   - `POST /api/swap/quote` - Get swap quote
   - `POST /api/swap/validate` - Validate swap parameters

3. **Frontend SwapInterface** (`frontend/components/SwapInterface.tsx`)
   - Token selection with search
   - Real-time quote updates (debounced)
   - Gasless mode toggle
   - Price impact warnings
   - Route visualization

4. **Smart Contract** (`stacks-contracts/contracts/paymaster.clar`)
   - `swap-gasless` function sponsors swap transactions
   - Accepts fee payment in USDCx instead of STX

## Velar DEX Integration

### SDK Usage

```typescript
import { VelarSDK } from '@velarprotocol/velar-sdk';

const sdk = new VelarSDK();

// Get swap instance
const swapInstance = await sdk.getSwapInstance({
  account: userAddress,
  inToken: 'USDCx',
  outToken: 'STX'
});

// Get quote
const quote = await swapInstance.getComputedAmount({
  amount: 100,
  slippage: 0.5
});

// Execute swap
const result = await swapInstance.swap({
  amount: 100
});
```

### Contract Addresses

**Mainnet:**
- Deployer: `SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1`
- Router: `SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.univ2-router`
- Core: `SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.univ2-core`

### Supported Tokens

Velar supports a wide range of tokens including:
- STX (Stacks)
- VELAR (Velar Token)
- aeUSDC (Wrapped USDC)
- aBTC (Wrapped Bitcoin)
- WELSH, SOME, ROCK, and more

Token list is fetched dynamically from: `https://sdk-beta.velar.network/tokens/symbols`

## Features

### 1. Token Discovery
- Automatic token list fetching from Velar
- Cached for 5 minutes to reduce API calls
- Fallback to basic token list if API fails

### 2. Real-Time Quotes
- Live pricing from Velar liquidity pools
- Multi-hop routing through STX when needed
- Price impact calculation
- Slippage protection (0.5% default)

### 3. Gasless Swaps
- Users pay fees in USDCx instead of STX
- Paymaster contract sponsors the transaction
- No STX balance required

### 4. Smart Routing
- Direct swaps when pools exist
- Multi-hop routing through STX for better rates
- Route visualization in UI

## API Reference

### Get Supported Tokens

```http
GET /api/swap/tokens
```

**Response:**
```json
[
  {
    "symbol": "USDCx",
    "name": "USDC (xReserve)",
    "address": "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx",
    "decimals": 6
  },
  {
    "symbol": "STX",
    "name": "Stacks",
    "address": "STX",
    "decimals": 6
  }
]
```

### Get Swap Quote

```http
POST /api/swap/quote
Content-Type: application/json

{
  "inputToken": "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx",
  "outputToken": "STX",
  "inputAmount": "1000000"
}
```

**Response:**
```json
{
  "inputToken": "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx",
  "outputToken": "STX",
  "inputAmount": "1000000",
  "outputAmount": "2000000",
  "priceImpact": 0.5,
  "route": ["USDCx", "STX"],
  "estimatedFee": "100000",
  "validUntil": 1234567890
}
```

### Validate Swap

```http
POST /api/swap/validate
Content-Type: application/json

{
  "userAddress": "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  "inputToken": "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usdcx",
  "inputAmount": "1000000"
}
```

**Response:**
```json
{
  "valid": true
}
```

## User Flow

1. **Select Tokens**
   - User selects input token (e.g., USDCx)
   - User selects output token (e.g., STX)

2. **Enter Amount**
   - User enters amount to swap
   - System fetches real-time quote from Velar
   - Displays output amount, price impact, and route

3. **Enable Gasless Mode**
   - User toggles gasless mode
   - Fee will be paid in USDCx instead of STX

4. **Execute Swap**
   - User clicks "Swap"
   - Transaction is submitted to paymaster contract
   - Paymaster sponsors gas and executes swap on Velar
   - User receives output tokens

## Error Handling

### Backend
- Falls back to estimated quotes if Velar API fails
- Validates user balances before swap
- Logs all errors for debugging

### Frontend
- Shows error notifications for failed quotes
- Disables swap button if validation fails
- Displays helpful error messages

## Testing

### Manual Testing
1. Start backend: `cd backend && npm run dev`
2. Start frontend: `cd frontend && npm run dev`
3. Connect wallet with testnet STX
4. Navigate to Swap tab
5. Select tokens and enter amount
6. Verify quote appears
7. Toggle gasless mode
8. Execute swap

### Integration Testing
```bash
cd backend
npm test
```

## Implementation Status

### ✅ Completed
- Velar SDK integration
- Real-time token list fetching
- Live quote generation from Velar pools
- Fallback pricing when API unavailable
- Backend service architecture
- API routes
- Frontend UI

### 🚧 In Progress
- Transaction execution via Velar SDK
- Paymaster contract integration with Velar router

### 📋 Planned
- Multi-DEX routing (compare Velar + ALEX)
- Limit orders
- Swap history tracking
- Price charts

## Resources

- [Velar Documentation](https://docs.velar.com/)
- [Velar SDK](https://docs.velar.com/velar/developers/velar-sdk)
- [Stacks Documentation](https://docs.stacks.co/)
- [VelumX GitHub](https://github.com/your-repo)

---

**Status:** ✅ Velar Integration Complete  
**Last Updated:** January 20, 2026
