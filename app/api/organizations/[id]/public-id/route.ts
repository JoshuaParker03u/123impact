import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getOrEnsurePublicId } from '@/lib/org-public-id';

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

type Params = { params: Promise<{ id: string }> };

// GET /api/organizations/[id]/public-id
// Returns (generating on first call) this org's public, one-way-hashed
// identifier -- what the public events feed URLs are built on instead of
// the raw org id. Any org member can view it, same bar as GET /organizations/[id].
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await buildSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from('organization_admins')
    .select('role')
    .eq('organization_id', id)
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const publicId = await getOrEnsurePublicId(id);
  return NextResponse.json({ public_id: publicId });
}
