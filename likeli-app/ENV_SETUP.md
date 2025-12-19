# Likeli App Environment Configuration

## Required for Devnet

Create a `.env.local` file with the following:

```env
# Solana Program ID (deployed to devnet)
NEXT_PUBLIC_PROGRAM_ID=8psUrun5yBN4aW655P3fuej3pCMNUvsBFqptoAG89RXc

# Solana RPC URL
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
```

## Optional (for full features)

```env
# Helius RPC (for better reliability)
HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY

# Supabase (for database features)
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Helius Webhook Secret
HELIUS_WEBHOOK_SECRET=your-webhook-secret
```
