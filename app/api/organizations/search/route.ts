import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// GET /api/organizations/search?q=<name>
// Auth required. Searches org names on the platform — does NOT expose any user memberships.
export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const session = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {}
        },
      },
    }
  );

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q            = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const filterEmail  = req.nextUrl.searchParams.get('email')?.toLowerCase().trim() ?? '';
  const excludeOrgId = req.nextUrl.searchParams.get('excludeOrgId') ?? '';

  if (!q) return NextResponse.json([]);

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // If an invitee email is provided, restrict results to orgs they actually belong to
  if (filterEmail) {
    const { data: users } = await service.auth.admin.listUsers();
    const target = (users?.users ?? []).find((u: any) => u.email?.toLowerCase() === filterEmail);
    if (!target) return NextResponse.json([]);

    let memberQuery = service
      .from('organization_admins')
      .select('organizations!inner(id, name, logo_url)')
      .eq('user_id', target.id)
      .ilike('organizations.name', `%${q}%`);

    if (excludeOrgId) memberQuery = memberQuery.neq('organization_id', excludeOrgId) as typeof memberQuery;

    const { data } = await memberQuery.limit(8);
    const orgs = (data ?? []).map((row: any) => row.organizations).filter(Boolean);
    return NextResponse.json(orgs);
  }

  // No email filter — search all active orgs by name
  const { data, error } = await service
    .from('organizations')
    .select('id, name, logo_url')
    .ilike('name', `%${q}%`)
    .eq('status', 'active')
    .limit(8);

  if (error) return NextResponse.json([], { status: 200 });
  return NextResponse.json(data ?? []);
}
