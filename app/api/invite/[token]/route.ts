import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

type Params = { params: Promise<{ token: string }> };

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

// GET /api/invite/[token]
// Public — returns invitation details for the acceptance page.
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const { service } = await buildClients();

  const { data: invite } = await service
    .from('organization_invitations')
    .select('*, organizations(name, logo_url)')
    .eq('token', token)
    .single();

  if (!invite) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Mark expired if needed
  if (invite.status === 'pending' && new Date(invite.expires_at) < new Date()) {
    await service
      .from('organization_invitations')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', invite.id);
    invite.status = 'expired';
  }

  // Fetch inviter display name
  const { data: inviterData } = await service.auth.admin.getUserById(invite.invited_by);
  const inviterName = inviterData?.user?.user_metadata?.full_name
    || inviterData?.user?.email
    || 'A team member';

  return NextResponse.json({
    status:       invite.status,
    role:         invite.role,
    email:        invite.email,
    expires_at:   invite.expires_at,
    inviter_name: inviterName,
    organization: invite.organizations,
  });
}

// POST /api/invite/[token]
// Authenticated — accept or decline an invitation.
export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { action } = await req.json() as { action: 'accept' | 'decline' };
  const now = new Date().toISOString();

  const { data: invite } = await service
    .from('organization_invitations')
    .select('*, organizations(name)')
    .eq('token', token)
    .single();

  if (!invite) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  if (invite.status !== 'pending') {
    return NextResponse.json({ error: invite.status }, { status: 409 });
  }

  if (new Date(invite.expires_at) < new Date()) {
    await service
      .from('organization_invitations')
      .update({ status: 'expired', updated_at: now })
      .eq('id', invite.id);
    return NextResponse.json({ error: 'expired' }, { status: 410 });
  }

  if (action === 'decline') {
    await service
      .from('organization_invitations')
      .update({ status: 'declined', updated_at: now })
      .eq('id', invite.id);
    return NextResponse.json({ redirect: '/' });
  }

  if (action === 'accept') {
    // Verify the logged-in user's email matches the invited email
    if (user.email?.toLowerCase() !== invite.email?.toLowerCase()) {
      return NextResponse.json(
        { error: 'This invitation was sent to a different email address. Please sign in with the invited email.' },
        { status: 403 }
      );
    }

    // Check not already a member
    const { data: existing } = await service
      .from('organization_admins')
      .select('id')
      .eq('organization_id', invite.organization_id)
      .eq('user_id', user.id)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'already_member', org_name: invite.organizations?.name }, { status: 409 });
    }

    // Add to org — always read role from invitation record at accept time
    const { error: insertError } = await service
      .from('organization_admins')
      .insert({
        organization_id: invite.organization_id,
        user_id:         user.id,
        role:            invite.role,
        permissions:     {},
      });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    await service
      .from('organization_invitations')
      .update({ status: 'accepted', accepted_at: now, updated_at: now })
      .eq('id', invite.id);

    return NextResponse.json({ redirect: '/admin/organizations' });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
