import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { findUserByEmail } from '@/lib/adminUsers';

type Params = { params: Promise<{ registrationId: string }> };

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

// GET /api/checkin/[registrationId]
// Viewer-aware response:
//   - Staff (org admin or active event admin): full record + check-in status
//   - Anyone else (including unauthenticated): minimal public info + check-in status
export async function GET(_req: NextRequest, { params }: Params) {
  const { registrationId } = await params;
  const { session, service } = await buildClients();

  // Load registration via service role (bypasses RLS — we control what we return)
  const { data: reg } = await service
    .from('volunteer_registrations')
    .select('id, name, email, shift_id, event_id, registered_at')
    .eq('id', registrationId)
    .single();

  if (!reg) return NextResponse.json({ error: 'Registration not found' }, { status: 404 });

  // Shiftless registrations have shift_id === null, so the event can't be
  // reached via a shifts join — go through the registration's own event_id
  // (always populated on every insert path) instead.
  const { data: event } = await service
    .from('events')
    .select('id, title, event_id, organization_id, date')
    .eq('id', reg.event_id)
    .single();

  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const { data: shift } = reg.shift_id
    ? await service
        .from('shifts')
        .select('id, name, start_time, end_time')
        .eq('id', reg.shift_id)
        .single()
    : { data: null };

  // Check existing check-in
  const { data: checkIn } = await service
    .from('check_ins')
    .select('id, checked_in_at, checked_in_by, is_override')
    .eq('registration_id', registrationId)
    .maybeSingle();

  // Determine if caller is staff
  const { data: { user } } = await session.auth.getUser();
  let isStaff = false;

  if (user) {
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
        .eq('event_id', event.id)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle(),
    ]);

    isStaff = !!(orgMembership && ['owner', 'admin'].includes(orgMembership.role)) || !!eventAdmin;
  }

  const basePayload = {
    registration_id: reg.id,
    registrant_name: reg.name,
    event: {
      id:       event.id,
      title:    event.title,
      event_id: event.event_id,
      date:     event.date,
    },
    shift: shift
      ? {
          id:         shift.id,
          name:       shift.name,
          start_time: shift.start_time,
          end_time:   shift.end_time,
        }
      : {
          id:         '',
          name:       'General Registration',
          start_time: null,
          end_time:   null,
        },
    checked_in:     !!checkIn,
    checked_in_at:  checkIn?.checked_in_at ?? null,
    is_override:    checkIn?.is_override ?? false,
  };

  if (isStaff) {
    return NextResponse.json({
      ...basePayload,
      registrant_email: reg.email,
      registered_at:    reg.registered_at,
      checked_in_by:    checkIn?.checked_in_by ?? null,
      is_staff_view:    true,
    });
  }

  return NextResponse.json({ ...basePayload, is_staff_view: false });
}

// POST /api/checkin/[registrationId]
// Staff only — marks a volunteer as checked in.
// Creates a check_in record (unique per registration_id).
export async function POST(req: NextRequest, { params }: Params) {
  const { registrationId } = await params;
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Optional — set true when this call comes from the "mark as checked in"
  // override action on a no-show, rather than a normal scan/link check-in.
  const body = await req.json().catch(() => ({}));
  const isOverride = body?.override === true;

  // Load registration
  const { data: reg } = await service
    .from('volunteer_registrations')
    .select('id, name, email, shift_id, event_id')
    .eq('id', registrationId)
    .single();

  if (!reg) return NextResponse.json({ error: 'Registration not found' }, { status: 404 });

  // Shiftless registrations have shift_id === null — resolve the event via
  // the registration's own event_id rather than a shifts join (see GET above).
  const { data: event } = await service
    .from('events')
    .select('id, organization_id, event_id')
    .eq('id', reg.event_id)
    .single();

  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  // Verify staff access
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
      .eq('event_id', event.id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle(),
  ]);

  const isOrgAdmin = !!(orgMembership && ['owner', 'admin'].includes(orgMembership.role));
  const isStaff = isOrgAdmin || !!eventAdmin;

  if (!isStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Overriding a no-show is a corrective admin action, distinct from a
  // normal scan/link check-in — event admins handle day-of check-in but
  // shouldn't be able to reach into the org-wide volunteers list and mark
  // arbitrary people checked in.
  if (isOverride && !isOrgAdmin) {
    return NextResponse.json({ error: 'Only org admins can override a check-in.' }, { status: 403 });
  }

  // Already checked in?
  const { data: existing } = await service
    .from('check_ins')
    .select('id, checked_in_at, is_override')
    .eq('registration_id', registrationId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      already_checked_in: true,
      checked_in_at: existing.checked_in_at,
      is_override: existing.is_override,
    });
  }

  // Insert check-in record
  const { data: checkIn, error } = await service
    .from('check_ins')
    .insert({
      registration_id: registrationId,
      event_id:        event.id,
      checked_in_by:   user.id,
      is_override:     isOverride,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Send in-app notification to the registrant if they have a user account
  // (best-effort — no account required to register). Not awaited — this
  // previously blocked every check-in response on a full
  // auth.admin.listUsers() call just to find one user by email, adding real
  // latency to a nice-to-have side effect, not the check-in itself.
  // findUserByEmail also avoids a correctness bug listUsers() had: it's
  // paginated (50/page by default), so a straight listUsers() call was
  // silently missing this lookup on projects with many accumulated users.
  (async () => {
    const matchedUser = reg.email ? await findUserByEmail(service, reg.email) : null;
    if (!matchedUser) return;

    const { data: fullEvent } = await service.from('events').select('title').eq('id', event.id).single();
    await service.from('notifications').insert({
      user_id: matchedUser.id,
      type:    'check_in_confirmed',
      title:   'Check-in confirmed',
      body:    `You've been checked in for "${fullEvent?.title ?? 'the event'}".`,
      link:    `/events/${event.event_id ?? ''}/r/${registrationId}`,
    });
  })().catch(() => {});

  return NextResponse.json(
    { checked_in: true, checked_in_at: checkIn.checked_in_at, is_override: checkIn.is_override },
    { status: 201 }
  );
}

// DELETE /api/checkin/[registrationId]
// Staff only — reverses a check-in (e.g. someone marked as checked in by
// mistake, or a manual override that shouldn't have happened). check_ins is
// otherwise an append-only ledger, so this is intentionally a narrow,
// staff-gated corrective action rather than something registrants can do.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { registrationId } = await params;
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: reg } = await service
    .from('volunteer_registrations')
    .select('id, event_id')
    .eq('id', registrationId)
    .single();

  if (!reg) return NextResponse.json({ error: 'Registration not found' }, { status: 404 });

  const { data: event } = await service
    .from('events')
    .select('id, organization_id')
    .eq('id', reg.event_id)
    .single();

  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  // Undo only ever applies to overrides (checked below), so — same as
  // creating an override — this is restricted to org admins, not event
  // admins, unlike the normal staff check-in flow.
  const { data: orgMembership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', event.organization_id)
    .eq('user_id', user.id)
    .maybeSingle();

  const isOrgAdmin = !!(orgMembership && ['owner', 'admin'].includes(orgMembership.role));
  if (!isOrgAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Only manual overrides can be undone. A natural check-in (real scan/link
  // tap) stays on the permanent ledger — no "undo" for that.
  const { data: existing } = await service
    .from('check_ins')
    .select('id, is_override')
    .eq('registration_id', registrationId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Not checked in' }, { status: 404 });
  if (!existing.is_override) {
    return NextResponse.json({ error: 'Only manual overrides can be undone.' }, { status: 403 });
  }

  const { error } = await service
    .from('check_ins')
    .delete()
    .eq('registration_id', registrationId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ checked_in: false });
}
