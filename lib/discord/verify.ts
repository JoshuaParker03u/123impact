import { verifyKey } from 'discord-interactions';

// Verifies an incoming Discord Interactions webhook request. Must be called
// with the RAW request body (before JSON.parse) — the signature is computed
// over the exact bytes Discord sent, same requirement as the Stripe webhook
// in app/api/billing/webhook/route.ts.
export async function verifyDiscordRequest(rawBody: string, signature: string | null, timestamp: string | null): Promise<boolean> {
  if (!signature || !timestamp) return false;
  return verifyKey(rawBody, signature, timestamp, process.env.DISCORD_PUBLIC_KEY!);
}
