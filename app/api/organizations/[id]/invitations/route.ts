import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
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

async function getAuthAndMembership(session: any, service: any, orgId: string) {
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: membership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .single();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user, membership };
}

async function sendInvitationEmail(
  inviterName: string,
  inviteeEmail: string,
  orgName: string,
  role: string,
  token: string,
  expiresAt: string,
  origin: string
) {
  const acceptUrl = `${origin}/invite/${token}`;
  const expiry = new Date(expiresAt).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const html = wrapEmailHtml(`
    <h2>You've been invited to join ${orgName}</h2>
    <p>Hi there,</p>
    <p><strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on 123impact as a <strong>${role}</strong>.</p>
    <p style="margin:28px 0;text-align:center;">
      <a href="${acceptUrl}"
         style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
        Accept Invitation
      </a>
    </p>
    <p style="color:#6b7280;font-size:13px;">This invitation expires on <strong>${expiry}</strong>.</p>
    <p style="color:#6b7280;font-size:13px;">If the button above doesn't work, copy and paste this link into your browser:</p>
    <p style="color:#6b7280;font-size:12px;word-break:break-all;">${acceptUrl}</p>
    <p style="color:#9ca3af;font-size:12px;margin-top:24px;">If you weren't expecting this invitation, you can ignore this email.</p>
  `);

  return sendEmail({
    to: inviteeEmail,
    subject: `You've been invited to join ${orgName} on 123impact`,
    html,
  });
}

// GET /api/organizations/[id]/invitations
export async function GET(req: NextRequest, { params }: Params) {
  const { id: orgId } = await params;
  const { session, service } = await buildClients();
  const auth = await getAuthAndMembership(session, service, orgId);
  if ('error' in auth) return auth.error;

  // Mark expired invitations
  await service
    .from('organization_invitations')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('organization_id', orgId)
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString());

  const { data, error } = await service
    .from('organization_invitations')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch inviter names from auth.users
  const inviterIds = [...new Set((data ?? []).map((inv: any) => inv.invited_by))];
  let nameMap: Record<string, string> = {};
  if (inviterIds.length > 0) {
    const { data: users } = await service.auth.admin.listUsers();
    (users?.users ?? []).forEach((u: any) => {
      if (inviterIds.includes(u.id)) {
        nameMap[u.id] = u.user_metadata?.full_name || u.email || u.id;
      }
    });
  }

  const enriched = (data ?? []).map((inv: any) => ({
    ...inv,
    inviter_name: nameMap[inv.invited_by] ?? 'Unknown',
  }));

  return NextResponse.json(enriched);
}

// POST /api/organizations/[id]/invitations
export async function POST(req: NextRequest, { params }: Params) {
  const { id: orgId } = await params;
  const { session, service } = await buildClients();
  const auth = await getAuthAndMembership(session, service, orgId);
  if ('error' in auth) return auth.error;
  const { user } = auth as any;

  const body = await req.json();
  const email = (body.email ?? '').toLowerCase().trim();
  const role  = body.role;

  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }
  if (!['admin', 'member'].includes(role)) {
    return NextResponse.json({ error: 'Role must be admin or member' }, { status: 400 });
  }

  // Check if already a member
  const { data: existingUsers } = await service.auth.admin.listUsers();
  const existingUser = (existingUsers?.users ?? []).find((u: any) => u.email === email);
  if (existingUser) {
    const { data: membership } = await service
      .from('organization_admins')
      .select('id')
      .eq('organization_id', orgId)
      .eq('user_id', existingUser.id)
      .single();

    if (membership) {
      return NextResponse.json(
        { error: `${email} is already a member of this organization.`, code: 'already_member' },
        { status: 409 }
      );
    }
  }

  // Check for existing pending invite
  const { data: existing } = await service
    .from('organization_invitations')
    .select('id, expires_at')
    .eq('organization_id', orgId)
    .eq('email', email)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .single();

  if (existing) {
    return NextResponse.json(
      { error: `A pending invitation already exists for ${email}.`, code: 'pending_exists', invite_id: existing.id },
      { status: 409 }
    );
  }

  // Fetch org name and inviter name for the email
  const { data: org } = await service
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single();

  const inviterUser = (existingUsers?.users ?? []).find((u: any) => u.id === user.id);
  const inviterName = inviterUser?.user_metadata?.full_name || inviterUser?.email || 'A team member';

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: invitation, error: insertError } = await service
    .from('organization_invitations')
    .insert({
      organization_id: orgId,
      email,
      role,
      invited_by: user.id,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (insertError || !invitation) {
    return NextResponse.json({ error: insertError?.message ?? 'Failed to create invitation' }, { status: 500 });
  }

  const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || '';
  const emailResult = await sendInvitationEmail(inviterName, email, org?.name ?? 'an organization', role, invitation.token, expiresAt, origin)
    .catch((e) => ({ success: false, error: e.message }));

  if (emailResult && !emailResult.success) {
    console.error('sendInvitationEmail failed:', emailResult.error);
  }

  // Notify existing user via in-app bell
  if (existingUser) {
    await service.from('notifications').insert({
      user_id: existingUser.id,
      type:    'org_invitation',
      title:   `You've been invited to join ${org?.name ?? 'an organization'}`,
      body:    `${inviterName} invited you to join ${org?.name ?? 'an organization'} as ${role}. Click to view the invitation.`,
      link:    `/invite/${invitation.token}`,
    });
  }

  return NextResponse.json({ ...invitation, email_sent: !emailResult || emailResult.success }, { status: 201 });
}
