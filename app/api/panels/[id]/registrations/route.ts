import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

type Params = { params: Promise<{ id: string }> };

// GET /api/panels/[id]/registrations — this panel's attendee list.
// Accessible to org admins AND event admins for this event.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: panelId } = await params;

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

  const { data: panel } = await service
    .from('panels')
    .select('id, event_id')
    .eq('id', panelId)
    .single();
  if (!panel) return NextResponse.json({ error: 'Panel not found' }, { status: 404 });

  const { data: event } = await service
    .from('events')
    .select('organization_id')
    .eq('id', panel.event_id)
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
      .eq('event_id', panel.event_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle(),
  ]);

  const isOrgAdmin = orgMembership && ['owner', 'admin'].includes(orgMembership.role);
  if (!isOrgAdmin && !eventAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await service
    .from('volunteer_registrations')
    .select('id, name, email, phone, registered_at, is_waitlisted, attendee_type')
    .eq('panel_id', panelId)
    .order('registered_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const registrationIds = (data ?? []).map((r) => r.id);
  const { data: checkIns } = registrationIds.length
    ? await service
        .from('check_ins')
        .select('registration_id, checked_in_at, is_override')
        .in('registration_id', registrationIds)
    : { data: [] };

  const checkInMap = new Map((checkIns ?? []).map((c) => [c.registration_id, c]));
  const withCheckIn = (data ?? []).map((r) => ({
    ...r,
    checked_in_at: checkInMap.get(r.id)?.checked_in_at ?? null,
    is_override: checkInMap.get(r.id)?.is_override ?? false,
  }));

  return NextResponse.json(withCheckIn);
}
