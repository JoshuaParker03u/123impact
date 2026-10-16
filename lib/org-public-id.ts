// Public, one-way identifier for an organization -- used in place of the
// raw database UUID in public, no-login URLs (the events feed) so that
// identifier can't be used to infer or correlate against the real internal
// id. Deterministic (HMAC of the org's own id), so it never needs threading
// through as separate state -- any caller holding an org id can always
// recompute the exact same public_id. Not reversible: going from a
// public_id back to the real org id requires the stored row, not
// computation (see resolveOrgIdFromPublicId).
import { createHmac } from 'crypto';
import { createClient } from '@supabase/supabase-js';

function buildServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function computePublicId(orgId: string): string {
  const secret = process.env.ORG_PUBLIC_ID_SECRET;
  if (!secret) throw new Error('ORG_PUBLIC_ID_SECRET is not set');
  return createHmac('sha256', secret).update(orgId).digest('hex').slice(0, 24);
}

// Reads organizations.public_id, computing and persisting it on first use.
// Safe under a concurrent race -- the hash is a pure function of orgId, so
// two callers racing to backfill the same never-before-seen org converge on
// the identical value regardless of which write lands last.
export async function getOrEnsurePublicId(orgId: string): Promise<string> {
  const service = buildServiceClient();
  const { data } = await service.from('organizations').select('public_id').eq('id', orgId).single();
  if (data?.public_id) return data.public_id;

  const publicId = computePublicId(orgId);
  await service.from('organizations').update({ public_id: publicId }).eq('id', orgId);
  return publicId;
}

// The only way back to a real org id from a public_id seen in a feed URL --
// a DB lookup, never a reverse computation.
export async function resolveOrgIdFromPublicId(publicId: string): Promise<string | null> {
  const service = buildServiceClient();
  const { data } = await service.from('organizations').select('id').eq('public_id', publicId).maybeSingle();
  return data?.id ?? null;
}
