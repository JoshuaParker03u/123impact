import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

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
    .select('id, name, email, shift_id, registered_at')
    .eq('id', registrationId)
    .single();

  if (!reg) return NextResponse.json({ error: 'Registration not found' }, { status: 404 });

  // Load shift + event info
  const { data: shift } = await service
    .from('shifts')
    .select('id, name, start_time, end_time, event_id, events!inner(id, title, event_id, organization_id, date)')
    .eq('id', reg.shift_id)
    .single();

  if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 });

  const event = (shift as any).events;

  // Check existing check-in
  const { data: checkIn } = await service
    .from('check_ins')
    .select('id, checked_in_at, checked_in_by')
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
    shift: {
      id:         shift.id,
      name:       (shift as any).name,
      start_time: (shift as any).start_time,
      end_time:   (shift as any).end_time,
    },
    checked_in:     !!checkIn,
    checked_in_at:  checkIn?.checked_in_at ?? null,
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
export async function POST(_req: NextRequest, { params }: Params) {
  const { registrationId } = await params;
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Load registration
  const { data: reg } = await service
    .from('volunteer_registrations')
    .select('id, name, shift_id')
    .eq('id', registrationId)
    .single();

  if (!reg) return NextResponse.json({ error: 'Registration not found' }, { status: 404 });

  // Load event for auth check
  const { data: shift } = await service
    .from('shifts')
    .select('event_id, events!inner(id, organization_id)')
    .eq('id', reg.shift_id)
    .single();

  if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 });

  const event = (shift as any).events;

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

  const isStaff =
    (orgMembership && ['owner', 'admin'].includes(orgMembership.role)) || !!eventAdmin;

  if (!isStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Already checked in?
  const { data: existing } = await service
    .from('check_ins')
    .select('id, checked_in_at')
    .eq('registration_id', registrationId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      already_checked_in: true,
      checked_in_at: existing.checked_in_at,
    });
  }

  // Insert check-in record
  const { data: checkIn, error } = await service
    .from('check_ins')
    .insert({
      registration_id: registrationId,
      event_id:        event.id,
      checked_in_by:   user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Send in-app notification to the registrant if they have a user account
  // (best-effort — no account required to register)
  const { data: userByEmail } = await service.auth.admin.listUsers();
  const matchedUser = userByEmail?.users?.find(
    (u: any) => u.email?.toLowerCase() === (reg as any).email?.toLowerCase()
  );
  if (matchedUser) {
    // Load event title for notification
    const { data: fullEvent } = await service
      .from('events')
      .select('title')
      .eq('id', event.id)
      .single();

    await service.from('notifications').insert({
      user_id: matchedUser.id,
      type:    'check_in_confirmed',
      title:   'Check-in confirmed',
      body:    `You've been checked in for "${fullEvent?.title ?? 'the event'}".`,
      link:    `/events/${(shift as any).event_id ?? ''}/r/${registrationId}`,
    }).then(() => {}); // fire-and-forget
  }

  return NextResponse.json({ checked_in: true, checked_in_at: checkIn.checked_in_at }, { status: 201 });
}
