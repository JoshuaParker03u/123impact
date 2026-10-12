import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { PanelAssignmentRole } from '@/lib/panels/assignment-roles';

type Params = { params: Promise<{ id: string; shiftId: string }> };

// GET /api/events/[id]/shifts/[shiftId]/registrations
// Accessible to org admins AND event admins for this event.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: eventId, shiftId } = await params;

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

  // Verify shift belongs to the event
  const { data: shift } = await service
    .from('shifts')
    .select('id, event_id')
    .eq('id', shiftId)
    .eq('event_id', eventId)
    .single();
  if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 });

  // Check access: org admin OR active event admin assignment
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

  const { data, error } = await service
    .from('volunteer_registrations')
    .select('id, name, email, phone, registered_at, is_waitlisted, attendee_type, public_consent')
    .eq('shift_id', shiftId)
    .order('registered_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const registrationIds = (data ?? []).map((r) => r.id);
  const [{ data: checkIns }, { data: panelAssignments }] = await Promise.all([
    registrationIds.length
      ? service
          .from('check_ins')
          .select('registration_id, checked_in_at, is_override')
          .in('registration_id', registrationIds)
      : Promise.resolve({ data: [] }),
    // A shift volunteer can also be attached to a panel via "Assign Speaker"/
    // "Assign Staff" without ever leaving their shift (see panel_assignments
    // POST route) — surfaced here so the roster shows where, instead of
    // leaving it invisible outside the Panels tab.
    registrationIds.length
      ? service
          .from('panel_assignments')
          .select('registration_id, role, panels(id, name)')
          .in('registration_id', registrationIds)
      : Promise.resolve({ data: [] }),
  ]);

  const checkInMap = new Map((checkIns ?? []).map((c) => [c.registration_id, c]));
  // Keyed by registration_id -> panel_id, so the same person assigned to
  // the same panel in more than one role (e.g. both "Assign Staff" and
  // "Assign Moderator" — allowed, since role is part of the row's own
  // uniqueness) collapses into one entry per panel instead of one per role.
  const panelsByRegistration = new Map<string, Map<string, { panel_id: string; panel_name: string; roles: PanelAssignmentRole[] }>>();
  type PanelAssignmentRow = { registration_id: string; role: PanelAssignmentRole; panels: { id: string; name: string } | null };
  for (const a of (panelAssignments ?? []) as unknown as PanelAssignmentRow[]) {
    const panel = a.panels;
    if (!panel) continue;
    const panels = panelsByRegistration.get(a.registration_id) ?? new Map();
    const entry = panels.get(panel.id) ?? { panel_id: panel.id, panel_name: panel.name, roles: [] };
    if (!entry.roles.includes(a.role)) entry.roles.push(a.role);
    panels.set(panel.id, entry);
    panelsByRegistration.set(a.registration_id, panels);
  }

  const withCheckIn = (data ?? []).map((r) => ({
    ...r,
    checked_in_at: checkInMap.get(r.id)?.checked_in_at ?? null,
    is_override: checkInMap.get(r.id)?.is_override ?? false,
    panel_assignments: [...(panelsByRegistration.get(r.id)?.values() ?? [])],
  }));

  return NextResponse.json(withCheckIn);
}
