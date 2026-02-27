import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

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

// GET /api/organizations/user
// Returns all organizations the authenticated user belongs to (via organization_admins).
export async function GET() {
  try {
    const supabase = await buildSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('organization_admins')
      .select(`
        role,
        permissions,
        organizations (
          id,
          name,
          logo_url,
          status
        )
      `)
      .eq('user_id', user.id);

    if (error) throw error;

    const organizations = (data ?? [])
      .filter((row) => row.organizations)
      .map((row) => ({
        id:          (row.organizations as any).id,
        name:        (row.organizations as any).name,
        logo_url:    (row.organizations as any).logo_url ?? null,
        status:      (row.organizations as any).status,
        role:        row.role,
        permissions: row.permissions ?? {},
      }));

    return NextResponse.json({ data: organizations });
  } catch (e: any) {
    console.error('[GET /api/organizations/user]', e);
    return NextResponse.json(
      { error: e.message ?? 'Internal server error' },
      { status: 500 }
    );
  }
}
