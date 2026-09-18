import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

type Params = { params: Promise<{ id: string }> };

const VALID_TYPES = ['volunteer', 'attendee', 'speaker'] as const;
type AttendeeType = typeof VALID_TYPES[number];

// PATCH /api/volunteer-registrations/[id]
// Body: { is_waitlisted?: boolean, attendee_type?: 'volunteer' | 'attendee' | 'speaker' }
//
// attendee_type isn't just a label — a row's shift_id/panel_id anchor
// determines what capacity it counts against, so a role change sometimes
// also means leaving that anchor:
//  - shift-anchored -> attendee/speaker: leaves the shift (shift_id cleared),
//    gated by the event's attendee/speaker settings.
//  - panel-anchored -> attendee/speaker: stays on the panel, free flip
//    either direction against the panel's one shared capacity pool (this is
//    "Promote to Speaker", generalized to also allow demoting back).
//  - panel-anchored -> volunteer: leaves the panel, becomes a shiftless
//    volunteer, gated by the event's shiftless settings.
//  - unanchored (shiftless volunteer / attendee / event-level speaker):
//    reassign freely among the three, each gated by its own event setting.
// A reselection of the current value is always a no-op and never
// capacity-checked — the row already counts toward its own bucket, so a
// fresh count would wrongly reject an at-capacity no-op.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: registrationId } = await params;

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

  const body = await req.json().catch(() => ({}));
  const { is_waitlisted, attendee_type } = body as { is_waitlisted?: boolean; attendee_type?: AttendeeType };

  if (attendee_type !== undefined && !VALID_TYPES.includes(attendee_type)) {
    return NextResponse.json({ error: 'Invalid attendee_type' }, { status: 400 });
  }

  const { data: reg } = await service
    .from('volunteer_registrations')
    .select('id, shift_id, event_id, panel_id, attendee_type')
    .eq('id', registrationId)
    .single();

  if (!reg) return NextResponse.json({ error: 'Registration not found' }, { status: 404 });

  // Resolve org via whichever scope this registration carries.
  let eventId: string | null = null;
  if (reg.shift_id) {
    const { data: shift } = await service.from('shifts').select('event_id').eq('id', reg.shift_id).single();
    eventId = shift?.event_id ?? null;
  } else if (reg.panel_id) {
    const { data: panel } = await service.from('panels').select('event_id').eq('id', reg.panel_id).single();
    eventId = panel?.event_id ?? null;
  } else {
    eventId = reg.event_id;
  }

  if (!eventId) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const { data: event } = await service
    .from('events')
    .select('organization_id, is_shiftless, shiftless_capacity, attendee_enabled, attendee_capacity, speaker_enabled')
    .eq('id', eventId)
    .single();

  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const { data: orgMembership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', event.organization_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!orgMembership || !['owner', 'admin'].includes(orgMembership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};

  if (attendee_type !== undefined) {
    const currentAnchor: 'shift' | 'panel' | 'event' = reg.shift_id ? 'shift' : reg.panel_id ? 'panel' : 'event';

    async function checkAttendeeCapacity() {
      if (!event!.attendee_enabled) return 'Event does not allow attendee registration';
      if (event!.attendee_capacity) {
        const { count } = await service
          .from('volunteer_registrations')
          .select('*', { count: 'exact', head: true })
          .eq('event_id', eventId)
          .eq('attendee_type', 'attendee');
        if ((count ?? 0) >= event!.attendee_capacity) return 'This event is full';
      }
      return null;
    }

    async function checkShiftlessCapacity() {
      if (!event!.is_shiftless) return 'Event does not allow shiftless registration';
      if (event!.shiftless_capacity) {
        const { count } = await service
          .from('volunteer_registrations')
          .select('*', { count: 'exact', head: true })
          .eq('event_id', eventId)
          .is('shift_id', null)
          .eq('attendee_type', 'volunteer');
        if ((count ?? 0) >= event!.shiftless_capacity) return 'This event is full';
      }
      return null;
    }

    function checkSpeakerAllowed() {
      return event!.speaker_enabled ? null : 'Event does not allow speaker registration';
    }

    if (currentAnchor === 'shift') {
      if (attendee_type !== 'volunteer') {
        // Leaving the shift for an event-level role.
        const err = attendee_type === 'attendee' ? await checkAttendeeCapacity() : checkSpeakerAllowed();
        if (err) return NextResponse.json({ error: err }, { status: err === 'This event is full' ? 409 : 400 });
        updates.shift_id = null;
        updates.is_waitlisted = false;
      }
    } else if (currentAnchor === 'panel') {
      // attendee/speaker/volunteer all stay on the panel via a simple
      // in-place flip — same mechanism as the original "Promote to
      // Speaker," now covering "Volunteer" too (panels can have volunteer
      // staff whenever panels are enabled; no separate event-level gate).
      // No capacity check: an in-place update never changes the panel's
      // real confirmed headcount (see the capacity fix in
      // app/api/events/[id]/panels/route.ts — every confirmed row counts
      // toward panel.capacity regardless of type, so relabeling one
      // doesn't add or remove an occupant). Deliberately never touches
      // panel_assignments — that table is only for attaching an existing
      // OTHER registration via "Assign Speaker"/"Assign Staff", which must
      // never mutate that other registration's own attendee_type.
      updates.is_waitlisted = false;
    } else if (attendee_type !== reg.attendee_type) {
      const err = attendee_type === 'attendee'
        ? await checkAttendeeCapacity()
        : attendee_type === 'volunteer'
        ? await checkShiftlessCapacity()
        : checkSpeakerAllowed();
      if (err) return NextResponse.json({ error: err }, { status: err === 'This event is full' ? 409 : 400 });
      updates.is_waitlisted = false;
    }

    updates.attendee_type = attendee_type;
  }

  if (is_waitlisted !== undefined) updates.is_waitlisted = is_waitlisted;

  const { data: updated, error } = await service
    .from('volunteer_registrations')
    .update(updates)
    .eq('id', registrationId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(updated);
}

// DELETE /api/volunteer-registrations/[id]
// Removes a volunteer registration. Requires org admin access.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id: registrationId } = await params;

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

  const { data: reg } = await service
    .from('volunteer_registrations')
    .select('shift_id, event_id')
    .eq('id', registrationId)
    .single();

  if (!reg) return NextResponse.json({ error: 'Registration not found' }, { status: 404 });

  // Resolve org from shift or event_id
  let orgId: string | null = null;
  if (reg.shift_id) {
    const { data: shift } = await service.from('shifts').select('event_id').eq('id', reg.shift_id).single();
    if (shift) {
      const { data: event } = await service.from('events').select('organization_id').eq('id', shift.event_id).single();
      orgId = event?.organization_id ?? null;
    }
  } else if (reg.event_id) {
    const { data: event } = await service.from('events').select('organization_id').eq('id', reg.event_id).single();
    orgId = event?.organization_id ?? null;
  }

  if (!orgId) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const { data: orgMembership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!orgMembership || !['owner', 'admin'].includes(orgMembership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await service
    .from('volunteer_registrations')
    .delete()
    .eq('id', registrationId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
