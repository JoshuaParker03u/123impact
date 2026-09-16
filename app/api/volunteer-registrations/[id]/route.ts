import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

type Params = { params: Promise<{ id: string }> };

// PATCH /api/volunteer-registrations/[id]
// Body: { is_waitlisted?: boolean, attendee_type?: 'speaker' }
// Two supported actions: promoting a waitlisted registration to confirmed,
// and "Promote to Speaker" — flipping a panel attendee's role in place
// (only valid for a row that's already scoped to a panel; this is what
// makes someone a panel speaker, no new row created). Requires org admin
// access for the event either way.
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
  const { is_waitlisted, attendee_type } = body;

  if (attendee_type !== undefined && attendee_type !== 'speaker') {
    return NextResponse.json({ error: 'Only promotion to speaker is supported' }, { status: 400 });
  }

  const { data: reg } = await service
    .from('volunteer_registrations')
    .select('id, shift_id, event_id, panel_id, attendee_type')
    .eq('id', registrationId)
    .single();

  if (!reg) return NextResponse.json({ error: 'Registration not found' }, { status: 404 });

  if (attendee_type === 'speaker') {
    if (!reg.panel_id) {
      return NextResponse.json({ error: 'Only a panel attendee can be promoted to speaker' }, { status: 400 });
    }
    if (reg.attendee_type !== 'attendee') {
      return NextResponse.json({ error: 'Only an attendee registration can be promoted' }, { status: 400 });
    }
  }

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
    .select('organization_id')
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
  if (is_waitlisted !== undefined) updates.is_waitlisted = is_waitlisted;
  if (attendee_type !== undefined) updates.attendee_type = attendee_type;

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
