import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { generateApiKey } from '@/lib/api-keys';
import { validateKeyRestrictions } from '@/lib/api-v1/resolve-export-request';

async function buildSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch { /* server component — safe to ignore */ }
        },
      },
    }
  );
}

function buildServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

type Params = { params: Promise<{ id: string }> };

async function requireOrgAdmin(id: string) {
  const supabase = await buildSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: membership } = await supabase
    .from('organization_admins')
    .select('role')
    .eq('organization_id', id)
    .eq('user_id', user.id)
    .single();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { userId: user.id };
}

// GET /api/organizations/[id]/api-keys — list this org's keys.
// Never returns key_hash or the full key -- only what's needed to tell
// keys apart and decide whether to revoke one.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireOrgAdmin(id);
  if ('error' in auth) return auth.error;

  const service = buildServiceClient();
  const { data, error } = await service
    .from('organization_api_keys')
    .select('id, name, key_prefix, created_at, last_used_at, revoked_at, allowed_formats, allowed_resources, expires_at')
    .eq('organization_id', id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/organizations/[id]/api-keys — generate a new key.
// Body: { name, allowed_formats?, allowed_resources?, expires_at? }. The
// full key is returned ONLY in this response; only its hash and a display
// prefix are ever persisted. The three optional fields narrow what the key
// can do (see lib/api-v1/resolve-export-request.ts) -- omitted/null means
// unrestricted/never-expires, exactly today's behavior.
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireOrgAdmin(id);
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const restrictions = validateKeyRestrictions(body);
  if ('error' in restrictions) return NextResponse.json({ error: restrictions.error }, { status: 400 });

  const { fullKey, prefix, hash } = generateApiKey();
  const service = buildServiceClient();
  const { data, error } = await service
    .from('organization_api_keys')
    .insert({
      organization_id: id,
      name,
      key_prefix: prefix,
      key_hash: hash,
      created_by: auth.userId,
      allowed_formats: restrictions.allowedFormats,
      allowed_resources: restrictions.allowedResources,
      expires_at: restrictions.expiresAt,
    })
    .select('id, name, key_prefix, created_at, allowed_formats, allowed_resources, expires_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, key: fullKey }, { status: 201 });
}
