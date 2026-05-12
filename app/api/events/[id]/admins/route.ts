import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { sendEmail } from '@/lib/email';
import { wrapEmailHtml } from '@/lib/email-templates';

type Params = { params: Promise<{ id: string }> };

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

async function requireOrgAdmin(service: any, eventId: string, userId: string) {
  const { data: event } = await service
    .from('events')
    .select('organization_id, title, date, organizations!inner(plan, name)')
    .eq('id', eventId)
    .single();
  if (!event) return { error: 'Event not found', status: 404 };

  const { data: membership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', event.organization_id)
    .eq('user_id', userId)
    .single();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return { error: 'Forbidden', status: 403 };
  }

  return { event, membership };
}

// GET /api/events/[id]/admins — list all assignments for this event
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: eventId } = await params;
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const check = await requireOrgAdmin(service, eventId, user.id);
  if ('error' in check && !('event' in check)) {
    return NextResponse.json({ error: check.error }, { status: check.status as number });
  }

  // Auto-expire stale assignments
  await service
    .from('event_admin_assignments')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('event_id', eventId)
    .in('status', ['active', 'pending'])
    .lt('expires_at', new Date().toISOString());

  const { data: assignments, error } = await service
    .from('event_admin_assignments')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: allUsers } = await service.auth.admin.listUsers();
  const userMap: Record<string, any> = {};
  (allUsers?.users ?? []).forEach((u: any) => { userMap[u.id] = u; });

  const enriched = (assignments ?? []).map((a: any) => {
    const assignedUser = a.user_id ? userMap[a.user_id] : null;
    const inviter = userMap[a.invited_by];
    return {
      ...a,
      user_name:    assignedUser?.user_metadata?.full_name || assignedUser?.email || null,
      user_avatar:  assignedUser?.user_metadata?.avatar_url || null,
      inviter_name: inviter?.user_metadata?.full_name || inviter?.email || null,
    };
  });

  return NextResponse.json(enriched);
}

// POST /api/events/[id]/admins — create assignment (internal = immediate, external = email invite)
export async function POST(req: NextRequest, { params }: Params) {
  const { id: eventId } = await params;
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const check = await requireOrgAdmin(service, eventId, user.id);
  if ('error' in check && !('event' in check)) {
    return NextResponse.json({ error: check.error }, { status: check.status as number });
  }

  const { event } = check as any;
  const org = event.organizations as any;

  // Paid plan gate
  if (!org.plan || org.plan === 'free') {
    return NextResponse.json(
      { error: 'Event Admin requires a paid plan', code: 'REQUIRES_PAID_PLAN' },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { email, expires_at, user_id: targetUserId, co_sponsor, co_sponsor_org_id, data_policy_accepted } = body;
  if (!email || !expires_at) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Prevent duplicate active/pending
  const { data: existing } = await service
    .from('event_admin_assignments')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('email', normalizedEmail)
    .in('status', ['active', 'pending'])
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: 'This person already has an active or pending assignment', code: 'DUPLICATE' },
      { status: 409 }
    );
  }

  const isInternal = !!targetUserId;

  const { data: assignment, error } = await service
    .from('event_admin_assignments')
    .insert({
      event_id:                eventId,
      user_id:                 targetUserId || null,
      email:                   normalizedEmail,
      invited_by:              user.id,
      status:                  isInternal ? 'active' : 'pending',
      expires_at,
      co_sponsor:              co_sponsor || false,
      co_sponsor_org_id:       co_sponsor_org_id || null,
      data_policy_accepted_at: (co_sponsor && isInternal && data_policy_accepted)
        ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const expiryFormatted = new Date(expires_at).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  if (isInternal) {
    // In-app notification — fire and forget
    void service.from('notifications').insert({
      user_id: targetUserId,
      type:    'event_admin_added',
      title:   "You've been added as Event Admin",
      body:    `You've been added as Event Admin for "${event.title}" hosted by ${org.name}. Your access expires on ${expiryFormatted}.`,
      link:    `/admin/events/${eventId}`,
    });
  } else {
    // Send invitation email
    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || '';
    const acceptUrl = `${origin}/event-invite/${assignment.token}`;

    const { data: inviterData } = await service.auth.admin.getUserById(user.id);
    const inviterName = inviterData?.user?.user_metadata?.full_name || inviterData?.user?.email || 'Someone';

    const html = wrapEmailHtml(`
      <h2>You're invited to manage an event</h2>
      <p>${inviterName} has invited you to be an <strong>Event Admin</strong> for:</p>
      <p style="font-size:20px;font-weight:bold;margin:16px 0;">${event.title}</p>
      <p style="color:#6b7280;margin-bottom:24px;">
        Hosted by ${org.name}<br/>
        Access expires: ${expiryFormatted}
      </p>
      <p>As Event Admin, you can view volunteer registrations, manage check-ins, and more.</p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${acceptUrl}"
           style="background:#2563eb;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
          Accept Invitation
        </a>
      </div>
      <p style="color:#9ca3af;font-size:13px;">Or copy this link:<br/>${acceptUrl}</p>
      <p style="color:#9ca3af;font-size:13px;">This invitation expires on ${expiryFormatted}.</p>
    `);

    sendEmail({
      to: normalizedEmail,
      subject: `${inviterName} invited you to manage "${event.title}"`,
      html,
    }).catch((e) => console.error('Event admin invite email error:', e));
  }

  return NextResponse.json(assignment, { status: 201 });
}
