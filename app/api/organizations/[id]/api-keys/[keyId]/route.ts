import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

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

type Params = { params: Promise<{ id: string; keyId: string }> };

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

// DELETE /api/organizations/[id]/api-keys/[keyId] — revoke a key.
// Soft-revoke (sets revoked_at) rather than deleting the row, keeping the
// audit trail of when a key existed and when it stopped being valid.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, keyId } = await params;
  const auth = await requireOrgAdmin(id);
  if ('error' in auth) return auth.error;

  const service = buildServiceClient();
  const { data: key } = await service
    .from('organization_api_keys')
    .select('id')
    .eq('id', keyId)
    .eq('organization_id', id)
    .single();

  if (!key) return NextResponse.json({ error: 'API key not found' }, { status: 404 });

  const { error } = await service
    .from('organization_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
