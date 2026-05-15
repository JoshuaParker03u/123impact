import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

type Params = { params: Promise<{ token: string }> };

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

// GET /api/event-invite/[token] — public lookup, returns invitation context
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const { service } = await buildClients();

  const { data: assignment } = await service
    .from('event_admin_assignments')
    .select('*, events!inner(id, title, date, location, organization_id, organizations!inner(name, logo_url)), co_sponsor_organization:organizations!event_admin_assignments_co_sponsor_org_id_fkey(id, name, logo_url)')
    .eq('token', token)
    .single();

  if (!assignment) return NextResponse.json({ error: 'Invalid invitation link' }, { status: 404 });

  // Auto-expire if past expiry
  if (new Date(assignment.expires_at) < new Date() && assignment.status === 'pending') {
    await service
      .from('event_admin_assignments')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', assignment.id);
    assignment.status = 'expired';
  }

  const { data: inviterData } = await service.auth.admin.getUserById(assignment.invited_by);
  const inviterName = inviterData?.user?.user_metadata?.full_name || inviterData?.user?.email || 'Someone';

  const event = (assignment as any).events;
  const org = event.organizations;

  const coSponsorOrg = (assignment as any).co_sponsor_organization ?? null;

  return NextResponse.json({
    assignment_id:  assignment.id,
    status:         assignment.status,
    email:          assignment.email,
    expires_at:     assignment.expires_at,
    is_co_sponsor:  assignment.co_sponsor || false,
    co_sponsor_org: coSponsorOrg ? { name: coSponsorOrg.name, logo_url: coSponsorOrg.logo_url } : null,
    event: {
      id:       event.id,
      title:    event.title,
      date:     event.date,
      location: event.location,
    },
    org: {
      name:     org.name,
      logo_url: org.logo_url,
    },
    inviter_name: inviterName,
  });
}

// POST /api/event-invite/[token] — accept or decline (requires auth)
export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { action, data_policy_accepted } = body;
  if (!['accept', 'decline'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const { data: assignment } = await service
    .from('event_admin_assignments')
    .select('*, events!inner(id, event_id, title, organization_id, organizations!inner(name)), co_sponsor_organization:organizations!event_admin_assignments_co_sponsor_org_id_fkey(id, name, logo_url)')
    .eq('token', token)
    .single();

  if (!assignment) return NextResponse.json({ error: 'Invalid invitation link' }, { status: 404 });

  if (assignment.status !== 'pending') {
    return NextResponse.json({ error: `Invitation is ${assignment.status}`, code: assignment.status.toUpperCase() }, { status: 409 });
  }

  if (new Date(assignment.expires_at) < new Date()) {
    await service
      .from('event_admin_assignments')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', assignment.id);
    return NextResponse.json({ error: 'Invitation has expired', code: 'EXPIRED' }, { status: 410 });
  }

  if (action === 'decline') {
    await service
      .from('event_admin_assignments')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('id', assignment.id);
    return NextResponse.json({ success: true, action: 'declined' });
  }

  // Accept — link user to the assignment
  const event = (assignment as any).events;
  const org = event.organizations;

  // Co-sponsor requires data policy acceptance
  if (assignment.co_sponsor && !data_policy_accepted) {
    return NextResponse.json({ error: 'You must accept the data usage policy to continue', code: 'POLICY_REQUIRED' }, { status: 400 });
  }

  // Co-sponsor requires recipient to actually be in the specified org
  if (assignment.co_sponsor && assignment.co_sponsor_org_id) {
    const { data: membership } = await service
      .from('organization_admins')
      .select('id')
      .eq('organization_id', assignment.co_sponsor_org_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      const coSponsorOrgName = (assignment as any).co_sponsor_organization?.name ?? 'the specified organization';
      return NextResponse.json(
        { error: `You are not a member of ${coSponsorOrgName}. Contact the event organizer.`, code: 'NOT_ORG_MEMBER' },
        { status: 403 }
      );
    }
  }

  const expiryFormatted = new Date(assignment.expires_at).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  const { error } = await service
    .from('event_admin_assignments')
    .update({
      user_id:                 user.id,
      status:                  'active',
      updated_at:              new Date().toISOString(),
      data_policy_accepted_at: assignment.co_sponsor ? new Date().toISOString() : null,
    })
    .eq('id', assignment.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // In-app notification
  void service.from('notifications').insert({
    user_id: user.id,
    type:    'event_admin_added',
    title:   "You've been added as Event Admin",
    body:    `You've been added as Event Admin for "${event.title}" hosted by ${org.name}. Your access expires on ${expiryFormatted}.`,
    link:    `/admin/events/${event.event_id}`,
  });

  return NextResponse.json({ success: true, action: 'accepted', event_id: event.id });
}
