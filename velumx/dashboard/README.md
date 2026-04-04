# VelumX Developer Dashboard

A Next.js dashboard for developers to manage their VelumX SDK integration, generate API keys, and monitor usage.

## Features

- 🔐 Authentication with Supabase (Email + GitHub OAuth)
- 🔑 API Key Generation and Management
- 📊 Usage Logs and Analytics
- 💰 Relayer Funding Management
- 🎨 Modern Dark UI with Tailwind CSS

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Create `.env.local` file:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Database (Supabase PostgreSQL)
DATABASE_URL="postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"

# VelumX Relayer
NEXT_PUBLIC_VELUMX_RELAYER_URL=https://api.velumx.xyz
```

### 3. Get Supabase Credentials

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project.
3. Go to **Settings > API**
4. Copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon/public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY` (keep secret!)

### 4. Configure Authentication Providers

#### Email Authentication (Already Enabled)
- Go to **Authentication > Providers** in Supabase
- Email provider should be enabled by default

#### GitHub OAuth
1. In Supabase: **Authentication > Providers > GitHub**
2. Copy the Callback URL shown
3. Go to [GitHub Developer Settings](https://github.com/settings/developers)
4. Click **New OAuth App**
5. Fill in:
   - **Application name**: VelumX Dashboard
   - **Homepage URL**: `https://dashboard.velumx.xyz`
   - **Authorization callback URL**: Paste from Supabase
6. Click **Register application**
7. Copy **Client ID** and generate **Client Secret**
8. Paste both into Supabase GitHub provider settings
9. Click **Save**

### 5. Set Up Database

```bash
# Run migrations
npx prisma migrate dev

# Generate Prisma client
npx prisma generate
```

### 6. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
velumx/dashboard/
├── src/
│   ├── app/
│   │   ├── (dashboard)/          # Protected dashboard routes
│   │   │   ├── api-keys/         # API key management
│   │   │   ├── funding/          # Relayer funding
│   │   │   └── logs/             # Usage logs
│   │   ├── api/
│   │   │   ├── keys/             # API key CRUD endpoints
│   │   │   └── auth/callback/    # OAuth callback
│   │   └── auth/
│   │       ├── signin/           # Sign in page
│   │       └── signup/           # Sign up page
│   ├── components/
│   │   ├── layout/               # Dashboard layout components
│   │   └── providers/            # Session provider
│   └── lib/
│       ├── supabase/             # Supabase client utilities
│       └── prisma.ts             # Prisma client singleton
├── prisma/
│   └── schema.prisma             # Database schema
└── public/                       # Static assets
```

## Database Schema

### ApiKey
- Stores developer API keys
- Links to Supabase Auth user via `userId`
- Tracks creation, last usage, and revocation

### UsageLog
- Records API key usage
- Tracks endpoint, method, status, response time
- Links to ApiKey for analytics

## API Routes

### Authentication
- `GET /auth/signin` - Sign in page
- `GET /auth/signup` - Sign up page
- `GET /auth/callback` - OAuth callback handler

### API Keys
- `GET /api/keys` - List user's API keys
- `POST /api/keys` - Generate new API key
- `DELETE /api/keys/[id]` - Revoke API key

## Usage

### For Developers Using VelumX

1. **Sign Up**: Create account with email or GitHub
2. **Generate API Key**: Go to API Keys page and create a new key
3. **Copy Key**: Save the key securely (shown only once)
4. **Integrate**: Use the key in your backend:

```typescript
import { VelumXClient } from '@velumx/sdk'

const client = new VelumXClient({
  apiKey: process.env.VELUMX_API_KEY, // sg_...
  network: 'testnet'
})

// Sponsor a transaction
const sponsored = await client.sponsorTransaction(unsignedTx)
```

5. **Monitor**: View usage logs in the dashboard
6. **Fund**: Add STX to your relayer balance for sponsoring transactions

## Relayer Wallet & Funding

Every developer on VelumX gets a dedicated **Relayer Wallet**. This wallet is used to pay the STX gas fees for your users' transactions.

### How to Fund
1. Copy your **Relayer Address** from the dashboard.
2. Send at least **5-10 STX** to this address from Leather or Xverse.
3. Your dashboard will update with the live balance, and you can start sponsoring!

### Private Key Export
For advanced users, you can export your Relayer's private key directly from the **API Keys** page. This allows you to:
- Sweep funds if you decide to stop using the platform.
- Manually manage the wallet in a standard Stacks wallet like Leather.

## Multi-Tenant Revenue Tracking

When using the `@velumx/sdk`, ensure you report your dApp's fee (e.g., 0.25 USDCx) during sponsorship. The dashboard will automatically aggregate these fees into your **Total USDCx Revenue** chart, giving you a clear view of your platform's profitability.

## Security

- ✅ API keys are prefixed with `sgal_live_` for production identification
- ✅ **Private Key Export** is gated behind secure session verification
- ✅ Sensitive service roles are never exposed to the client-side
- ✅ All sponsorship requests are validated against active API keys

## Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

### Manual

```bash
npm run build
npm start
```

## Troubleshooting

### "Unauthorized" errors
- Check Supabase credentials in `.env.local`
- Verify user is signed in
- Check browser console for auth errors

### Database connection errors
- Verify `DATABASE_URL` is correct
- Check Supabase database is running
- Run `npx prisma migrate dev` to sync schema

### OAuth not working
- Verify callback URL matches in GitHub and Supabase
- Check Client ID and Secret are correct
- Ensure GitHub OAuth app is not suspended

## Documentation

- [SETUP.md](./SETUP.md) - Detailed setup instructions
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture overview
- [Supabase Docs](https://supabase.com/docs)
- [Next.js Docs](https://nextjs.org/docs)
- [Prisma Docs](https://www.prisma.io/docs)

## Support

For issues or questions:
- Check existing documentation
- Review Supabase logs
- Check browser console for errors
- Verify environment variables are set correctly
