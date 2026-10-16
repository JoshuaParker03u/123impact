// Per-organization Bearer API keys -- infrastructure for future
// authenticated endpoints. Nothing in this codebase calls
// authenticateApiKey() yet; it exists so a future route can import it
// rather than invent its own token scheme.
import { randomBytes, createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const KEY_PREFIX = '123i_';
// Long enough to be useful for an admin telling keys apart in a list
// without ever re-revealing the secret -- short enough that it alone is
// nowhere near enough entropy to guess the rest of the key.
const DISPLAY_PREFIX_LENGTH = 12;

function buildServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function hashKey(fullKey: string): string {
  return createHash('sha256').update(fullKey).digest('hex');
}

// Pure -- no DB access. The caller is responsible for persisting prefix +
// hash and returning fullKey to the admin exactly once.
export function generateApiKey(): { fullKey: string; prefix: string; hash: string } {
  const fullKey = `${KEY_PREFIX}${randomBytes(32).toString('hex')}`;
  return {
    fullKey,
    prefix: fullKey.slice(0, DISPLAY_PREFIX_LENGTH),
    hash: hashKey(fullKey),
  };
}

export type ApiKeyAuthResult = { organizationId: string } | { error: NextResponse };

// Verifies an Authorization: Bearer <key> header against
// organization_api_keys, same union-result convention as the existing
// session-based authenticate() in app/api/[[...path]]/route.ts.
export async function authenticateApiKey(req: NextRequest): Promise<ApiKeyAuthResult> {
  const authHeader = req.headers.get('authorization');
  const match = authHeader?.match(/^Bearer (.+)$/);
  if (!match) {
    return { error: NextResponse.json({ error: 'Missing bearer token' }, { status: 401 }) };
  }

  const service = buildServiceClient();
  const { data } = await service
    .from('organization_api_keys')
    .select('id, organization_id')
    .eq('key_hash', hashKey(match[1]))
    .is('revoked_at', null)
    .maybeSingle();

  if (!data) {
    return { error: NextResponse.json({ error: 'Invalid or revoked API key' }, { status: 401 }) };
  }

  // Best-effort usage tracking -- never blocks or fails the request over it.
  (async () => {
    const { error } = await service
      .from('organization_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id);
    if (error) console.error('api key last_used_at update failed:', error);
  })();

  return { organizationId: data.organization_id };
}
