import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { wrapEmailHtml } from '@/lib/email-templates';

type Params = { params: Promise<{ id: string; inviteId: string }> };

async function buildClients() {
  const cookieStore = await cookies();
  const session = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch { /* server component */ }
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

// PATCH /api/organizations/[id]/invitations/[inviteId]
// Body: { action: 'cancel' | 'resend' | 'update_role', role?: string }
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: orgId, inviteId } = await params;
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: membership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .single();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: invite } = await service
    .from('organization_invitations')
    .select('*')
    .eq('id', inviteId)
    .eq('organization_id', orgId)
    .single();

  if (!invite) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });

  const isOwner  = membership.role === 'owner';
  const isSender = invite.invited_by === user.id;

  // Only original sender or org owner can mutate
  if (!isOwner && !isSender) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body   = await req.json();
  const action = body.action as 'cancel' | 'resend' | 'update_role';
  const now    = new Date().toISOString();

  if (action === 'cancel') {
    if (!['pending', 'expired'].includes(invite.status)) {
      return NextResponse.json({ error: 'Only pending invitations can be cancelled' }, { status: 400 });
    }
    const { data, error } = await service
      .from('organization_invitations')
      .update({ status: 'cancelled', updated_at: now })
      .eq('id', inviteId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === 'resend') {
    if (invite.status !== 'pending' && invite.status !== 'expired') {
      return NextResponse.json({ error: 'Only pending or expired invitations can be resent' }, { status: 400 });
    }
    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await service
      .from('organization_invitations')
      .update({ status: 'pending', expires_at: newExpiry, updated_at: now })
      .eq('id', inviteId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Resend email
    const [orgRow, allUsers] = await Promise.all([
      service.from('organizations').select('name').eq('id', orgId).single(),
      service.auth.admin.listUsers(),
    ]);
    const inviterUser = (allUsers.data?.users ?? []).find((u: any) => u.id === user.id);
    const inviterName = inviterUser?.user_metadata?.full_name || inviterUser?.email || 'A team member';
    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || '';

    const acceptUrl = `${origin}/invite/${invite.token}`;
    const expiry = new Date(newExpiry).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const html = wrapEmailHtml(`
      <h2>You've been invited to join ${orgRow.data?.name}</h2>
      <p><strong>${inviterName}</strong> has re-sent your invitation to join <strong>${orgRow.data?.name}</strong> as a <strong>${invite.role}</strong>.</p>
      <p style="margin:28px 0;text-align:center;">
        <a href="${acceptUrl}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
          Accept Invitation
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px;">This invitation expires on <strong>${expiry}</strong>.</p>
      <p style="color:#6b7280;font-size:12px;word-break:break-all;">${acceptUrl}</p>
    `);
    sendEmail({
      to: invite.email,
      subject: `You've been invited to join ${orgRow.data?.name} on 123impact`,
      html,
    }).catch((e) => console.error('resend email error:', e));

    return NextResponse.json(data);
  }

  if (action === 'update_role') {
    const newRole = body.role;
    if (!['admin', 'member'].includes(newRole)) {
      return NextResponse.json({ error: 'Role must be admin or member' }, { status: 400 });
    }
    if (invite.status !== 'pending') {
      return NextResponse.json({ error: 'Can only update role on pending invitations' }, { status: 400 });
    }
    const { data, error } = await service
      .from('organization_invitations')
      .update({ role: newRole, updated_at: now })
      .eq('id', inviteId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
