import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { sendDirectMessage } from '@/lib/discord/dm';
import { baseEmbed } from '@/lib/discord/embed';
import { VALID_ATTENDEE_TYPES, countsNeededFor, planRoleReassignment, type AttendeeType, type Anchor } from '@/lib/volunteer-registrations/role-reassignment';

type Params = { params: Promise<{ id: string }> };

const VALID_TYPES = VALID_ATTENDEE_TYPES;

const ROLE_LABELS: Record<AttendeeType, string> = {
  volunteer: 'Volunteer',
  attendee:  'Attendee',
  speaker:   'Speaker',
};

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
    .select('id, shift_id, event_id, panel_id, attendee_type, discord_user_id')
    .eq('id', registrationId)
    .single();

  if (!reg) return NextResponse.json({ error: 'Registration not found' }, { status: 404 });

  // Resolve org via whichever scope this registration carries. Also grabs a
  // human-readable name for the role-change DM below — the panel's own name
  // when panel-anchored (role changes never leave the panel), else the
  // event's title.
  let eventId: string | null = null;
  let contextName: string | null = null;
  if (reg.shift_id) {
    const { data: shift } = await service.from('shifts').select('event_id').eq('id', reg.shift_id).single();
    eventId = shift?.event_id ?? null;
  } else if (reg.panel_id) {
    const { data: panel } = await service.from('panels').select('event_id, name').eq('id', reg.panel_id).single();
    eventId = panel?.event_id ?? null;
    contextName = panel?.name ?? null;
  } else {
    eventId = reg.event_id;
  }

  if (!eventId) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const { data: event } = await service
    .from('events')
    .select('title, organization_id, is_shiftless, shiftless_capacity, attendee_enabled, attendee_capacity, speaker_enabled')
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

  let updates: Record<string, unknown> = {};

  if (attendee_type !== undefined) {
    const currentAnchor: Anchor = reg.shift_id ? 'shift' : reg.panel_id ? 'panel' : 'event';
    const currentType = reg.attendee_type as AttendeeType;

    const needed = countsNeededFor({ currentAnchor, currentType, newType: attendee_type, event });
    const [attendeeCountRes, shiftlessCountRes] = await Promise.all([
      needed.attendeeCount
        ? service.from('volunteer_registrations').select('*', { count: 'exact', head: true }).eq('event_id', eventId).eq('attendee_type', 'attendee')
        : Promise.resolve({ count: undefined }),
      needed.shiftlessVolunteerCount
        ? service.from('volunteer_registrations').select('*', { count: 'exact', head: true }).eq('event_id', eventId).is('shift_id', null).eq('attendee_type', 'volunteer')
        : Promise.resolve({ count: undefined }),
    ]);

    // Panel-anchored transitions deliberately never touch panel_assignments
    // — that table is only for attaching an existing OTHER registration via
    // "Assign Speaker"/"Assign Staff", which must never mutate that other
    // registration's own attendee_type.
    const result = planRoleReassignment({
      currentAnchor,
      currentType,
      newType: attendee_type,
      event,
      counts: { attendeeCount: attendeeCountRes.count ?? undefined, shiftlessVolunteerCount: shiftlessCountRes.count ?? undefined },
    });

    if (result.error) return NextResponse.json({ error: result.error.message }, { status: result.error.status });
    updates = { ...updates, ...result.updates };
  }

  if (is_waitlisted !== undefined) updates.is_waitlisted = is_waitlisted;

  const { data: updated, error } = await service
    .from('volunteer_registrations')
    .update(updates)
    .eq('id', registrationId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Best-effort — never blocks or fails the role change itself. Only fires
  // on a genuine change (never a no-op reselection), and only when this
  // registration is linked to a Discord account (i.e. they signed up or
  // were reached via the bot in the first place).
  if (attendee_type !== undefined && attendee_type !== reg.attendee_type && reg.discord_user_id) {
    const name = contextName ?? event.title;
    const embed = baseEmbed({
      title: 'Role updated',
      description: `Your role for **${name}** has been updated to **${ROLE_LABELS[attendee_type]}**.`,
    });
    sendDirectMessage(reg.discord_user_id, { embeds: [embed] }).catch((e) => console.error('role-change DM error:', e));
  }

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
