import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { sendEmail } from '@/lib/email';
import { wrapEmailHtml } from '@/lib/email-templates';

type Params = { params: Promise<{ id: string; assignmentId: string }> };

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

// PATCH /api/events/[id]/admins/[assignmentId]
// body: { action: 'update_expiry', expires_at } | { action: 'resend' }
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: eventId, assignmentId } = await params;
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify caller is org admin for this event
  const { data: event } = await service
    .from('events')
    .select('organization_id, title, date, organizations!inner(name, logo_url)')
    .eq('id', eventId)
    .single();
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const { data: membership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', event.organization_id)
    .eq('user_id', user.id)
    .single();
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: assignment } = await service
    .from('event_admin_assignments')
    .select('*')
    .eq('id', assignmentId)
    .eq('event_id', eventId)
    .single();
  if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

  const body = await req.json();
  const { action, expires_at } = body;

  if (action === 'update_expiry') {
    if (!expires_at) return NextResponse.json({ error: 'Missing expires_at' }, { status: 400 });

    const { data: updated, error } = await service
      .from('event_admin_assignments')
      .update({ expires_at, updated_at: new Date().toISOString() })
      .eq('id', assignmentId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(updated);
  }

  if (action === 'resend') {
    if (assignment.status !== 'pending') {
      return NextResponse.json({ error: 'Can only resend pending invitations' }, { status: 400 });
    }

    // Expiry = event end date + 5 days; fall back to 7 days from now if event is past
    const eventDate = new Date((event as any).date);
    const defaultExpiry = new Date(eventDate.getTime() + 5 * 24 * 60 * 60 * 1000);
    const newExpiry = defaultExpiry > new Date()
      ? defaultExpiry.toISOString()
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await service
      .from('event_admin_assignments')
      .update({ expires_at: newExpiry, updated_at: new Date().toISOString() })
      .eq('id', assignmentId);

    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || '';
    const acceptUrl = `${origin}/event-invite/${assignment.token}`;

    const { data: inviterData } = await service.auth.admin.getUserById(user.id);
    const inviterName = inviterData?.user?.user_metadata?.full_name || inviterData?.user?.email || 'Someone';
    const org = (event as any).organizations as any;
    const expiryFormatted = new Date(newExpiry).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });

    const html = wrapEmailHtml(`
      <h2>Reminder: You're invited to manage an event</h2>
      <p>${inviterName} has invited you to be an <strong>Event Admin</strong> for:</p>
      <p style="font-size:20px;font-weight:bold;margin:16px 0;">${event.title}</p>
      <p style="color:#6b7280;margin-bottom:24px;">
        Hosted by ${org.name}<br/>
        Access expires: ${expiryFormatted}
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${acceptUrl}"
           style="background:#2563eb;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
          Accept Invitation
        </a>
      </div>
      <p style="color:#9ca3af;font-size:13px;">Or copy this link:<br/>${acceptUrl}</p>
    `, { name: org.name, logoUrl: org.logo_url });

    sendEmail({
      to: assignment.email,
      subject: `Reminder: ${inviterName} invited you to manage "${event.title}"`,
      html,
    }).catch((e) => console.error('Resend event admin invite error:', e));

    // Notify existing user via in-app bell
    const { data: allInvitees } = await service.auth.admin.listUsers();
    const searchEmail = (assignment.email ?? '').toLowerCase().trim();
    const inviteeUser = (allInvitees?.users ?? []).find((u: any) => (u.email ?? '').toLowerCase().trim() === searchEmail);
    if (inviteeUser) {
      await service.from('notifications').insert({
        user_id: inviteeUser.id,
        type:    'event_admin_invited',
        title:   `You've been invited to manage "${event.title}"`,
        body:    `${inviterName} invited you to manage "${event.title}" hosted by ${org.name}. Access expires ${expiryFormatted}.`,
        link:    `/event-invite/${assignment.token}`,
      });
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

// DELETE /api/events/[id]/admins/[assignmentId] — revoke assignment
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id: eventId, assignmentId } = await params;
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: event } = await service
    .from('events')
    .select('organization_id')
    .eq('id', eventId)
    .single();
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const { data: membership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', event.organization_id)
    .eq('user_id', user.id)
    .single();
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await service
    .from('event_admin_assignments')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('id', assignmentId)
    .eq('event_id', eventId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
