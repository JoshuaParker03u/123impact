import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { eventbriteGetAttendees, mapEventbriteAttendee } from '@/lib/platforms/eventbrite';

type Params = { params: Promise<{ id: string }> };

async function buildClients() {
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
  return { session, service };
}

// GET /api/events/[id]/eventbrite-attendees
// Read-only view of ticket holders on Eventbrite — never written to
// volunteer_registrations. See lib/platforms/eventbrite.ts for why.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: eventId } = await params;
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: event } = await service
    .from('events')
    .select('id, organization_id, external_id, platform_source')
    .eq('id', eventId)
    .single();
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  if (event.platform_source !== 'eventbrite' || !event.external_id) {
    return NextResponse.json({ error: 'This event was not imported from Eventbrite' }, { status: 400 });
  }

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

  const isAdmin = orgMembership && ['owner', 'admin'].includes(orgMembership.role);
  if (!isAdmin && !eventAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: connection } = await service
    .from('platform_connections')
    .select('access_token')
    .eq('organization_id', event.organization_id)
    .eq('platform', 'eventbrite')
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({ error: 'No active Eventbrite connection for this organization' }, { status: 400 });
  }

  try {
    const raw = await eventbriteGetAttendees(connection.access_token, event.external_id);
    const attendees = raw.map(mapEventbriteAttendee);
    return NextResponse.json({ attendees });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch attendees from Eventbrite' }, { status: 502 });
  }
}
