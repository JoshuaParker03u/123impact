import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { fetchOrgAnalytics } from '../route';

type Params = { params: Promise<{ id: string }> };

// GET /api/organizations/[id]/analytics/export
// Returns CSV: event_title, event_date, volunteer_count, new, returning
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: orgId } = await params;

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
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: membership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const data = await fetchOrgAnalytics(service, orgId);

  const rows = [
    ['event_title', 'event_date', 'new_volunteers', 'returning_volunteers', 'total'],
    ...data.per_event.map((e: { title: string; date: string; new: number; returning: number }) => [
      `"${e.title.replace(/"/g, '""')}"`,
      e.date,
      String(e.new),
      String(e.returning),
      String(e.new + e.returning),
    ]),
  ];

  const csv = rows.map((r) => r.join(',')).join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="volunteer-health-${orgId}.csv"`,
    },
  });
}
