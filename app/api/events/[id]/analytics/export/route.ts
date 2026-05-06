import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { fetchAnalyticsData } from '../route';

type Params = { params: Promise<{ id: string }> };

// GET /api/events/[id]/analytics/export
// Returns a CSV with attendee_type, check-in status, new/returning flag. No PII.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: eventId } = await params;

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

  // Auth check
  const { data: event } = await service
    .from('events')
    .select('id, organization_id')
    .eq('id', eventId)
    .single();
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const { data: orgMembership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', event.organization_id)
    .eq('user_id', user.id)
    .maybeSingle();

  const { data: eventAdmin } = await service
    .from('event_admin_assignments')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (!(orgMembership && ['owner', 'admin'].includes(orgMembership.role)) && !eventAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const data = await fetchAnalyticsData(service, eventId);
  if (!data) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const rows = [
    ['attendee_type', 'checked_in', 'is_returning'],
    ...data.registrations.map((r: { attendee_type: string; checked_in: boolean; is_returning: boolean }) => [
      r.attendee_type,
      r.checked_in ? 'yes' : 'no',
      r.is_returning ? 'yes' : 'no',
    ]),
  ];

  const csv = rows.map((r) => r.join(',')).join('\n');
  const filename = `event-analytics-${eventId}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
