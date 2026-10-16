import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { excludeInvitedSpeakers } from '@/lib/events/role-speakers';

type Params = { params: Promise<{ id: string }> };

// GET /api/events/[id]/shiftless-registrations
// Returns all event-level (shiftless) registrations for an event.
// Accessible to org admins and event admins.
export async function GET(req: NextRequest, { params }: Params) {
  const { id: eventId } = await params;
  const type = req.nextUrl.searchParams.get('type');

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

  const { data: event } = await service
    .from('events')
    .select('organization_id')
    .eq('id', eventId)
    .single();
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const [{ data: orgMembership }, { data: eventAdmin }] = await Promise.all([
    service
      .from('organization_admins')
      .select('role')
      .eq('organization_id', event.organization_id)
      .eq('user_id', user.id)
      .maybeSingle(),
    service
      .from('event_admin_assignments')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle(),
  ]);

  const isOrgAdmin = orgMembership && ['owner', 'admin'].includes(orgMembership.role);
  if (!isOrgAdmin && !eventAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let query = service
    .from('volunteer_registrations')
    .select('id, name, email, discord_username, phone, registered_at, attendee_type, public_consent')
    .eq('event_id', eventId)
    .is('shift_id', null)
    .is('panel_id', null)
    .order('registered_at', { ascending: true });

  // type=attendee -> the Attendees tab; type=speaker -> the "promoted from a
  // role change" section of the Speaker Invites tab (see below); otherwise
  // this is the plain shiftless-volunteer "Registrations" table, which
  // should only ever show volunteer rows (a stray attendee/speaker row here
  // would otherwise be mixed in unfiltered, which is more visible now that
  // this table has a Role column).
  query = type === 'attendee'
    ? query.eq('attendee_type', 'attendee')
    : type === 'speaker'
    ? query.eq('attendee_type', 'speaker')
    : query.eq('attendee_type', 'volunteer');

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // A speaker here can land unanchored two ways: accepting an invite token
  // (already tracked and displayed via event_speaker_invites, by the Speaker
  // Invites tab's main list) or being promoted directly from a shift/event
  // role via setEventLevelRole, which has no invite record at all. Only the
  // second kind belongs in the type=speaker result -- otherwise an invited
  // speaker would show up twice, once in each list.
  let filtered = data ?? [];
  if (type === 'speaker' && filtered.length > 0) {
    const { data: invited } = await service
      .from('event_speaker_invites')
      .select('registration_id')
      .in('registration_id', filtered.map((r) => r.id));
    filtered = excludeInvitedSpeakers(filtered, (invited ?? []).map((i) => i.registration_id));
  }

  const registrationIds = filtered.map((r) => r.id);
  const { data: checkIns } = registrationIds.length
    ? await service
        .from('check_ins')
        .select('registration_id, checked_in_at, is_override')
        .in('registration_id', registrationIds)
    : { data: [] };

  const checkInMap = new Map((checkIns ?? []).map((c) => [c.registration_id, c]));
  const withCheckIn = filtered.map((r) => ({
    ...r,
    checked_in_at: checkInMap.get(r.id)?.checked_in_at ?? null,
    is_override: checkInMap.get(r.id)?.is_override ?? false,
  }));

  return NextResponse.json(withCheckIn);
}
