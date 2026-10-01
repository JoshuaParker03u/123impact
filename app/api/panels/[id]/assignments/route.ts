import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

type Params = { params: Promise<{ id: string }> };

function buildServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function buildSessionClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
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
}

// GET /api/panels/[id]/assignments — this panel's speaker/staff assignments,
// joined with registration details for display. Accessible to org admins
// AND event admins (matches app/api/panels/[id]/registrations/route.ts).
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: panelId } = await params;
  const cookieStore = await cookies();
  const session = await buildSessionClient(cookieStore);
  const service = buildServiceClient();

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: panel } = await service.from('panels').select('id, event_id').eq('id', panelId).single();
  if (!panel) return NextResponse.json({ error: 'Panel not found' }, { status: 404 });

  const { data: event } = await service.from('events').select('organization_id').eq('id', panel.event_id).single();
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const [{ data: orgMembership }, { data: eventAdmin }] = await Promise.all([
    service.from('organization_admins').select('role').eq('organization_id', event.organization_id).eq('user_id', user.id).maybeSingle(),
    service.from('event_admin_assignments').select('id').eq('event_id', panel.event_id).eq('user_id', user.id).eq('status', 'active').gt('expires_at', new Date().toISOString()).maybeSingle(),
  ]);

  const isOrgAdmin = orgMembership && ['owner', 'admin'].includes(orgMembership.role);
  if (!isOrgAdmin && !eventAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await service
    .from('panel_assignments')
    .select('id, role, assigned_at, registration:volunteer_registrations(id, name, email, speaker_topic)')
    .eq('panel_id', panelId)
    .order('assigned_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/panels/[id]/assignments
// Body: { registration_id, role: 'speaker' | 'volunteer' }
// Attaches an existing event registration to this panel in a secondary
// capacity, without touching that registration's own row (unlike
// "Promote to Speaker", which mutates a panel attendee's row directly).
// Org owner/admin only.
export async function POST(req: NextRequest, { params }: Params) {
  const { id: panelId } = await params;
  const cookieStore = await cookies();
  const session = await buildSessionClient(cookieStore);
  const service = buildServiceClient();

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { registration_id, role } = await req.json();
  if (!registration_id || (role !== 'speaker' && role !== 'volunteer')) {
    return NextResponse.json({ error: 'registration_id and a valid role are required' }, { status: 400 });
  }

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

  const { data: membership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', event.organization_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // The candidate must actually belong to this event, and hold the role
  // being assigned (e.g. can't assign someone as "speaker" who never
  // registered/was invited as one).
  const { data: registration } = await service
    .from('volunteer_registrations')
    .select('id, event_id, attendee_type')
    .eq('id', registration_id)
    .single();

  if (!registration || registration.event_id !== panel.event_id) {
    return NextResponse.json({ error: 'Registration not found for this event' }, { status: 404 });
  }
  if (registration.attendee_type !== role) {
    return NextResponse.json({ error: `This person is not registered as a ${role}` }, { status: 400 });
  }

  const { data: assignment, error } = await service
    .from('panel_assignments')
    .insert({
      panel_id: panelId,
      registration_id,
      role,
      assigned_by: user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Already assigned to this panel' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(assignment, { status: 201 });
}
