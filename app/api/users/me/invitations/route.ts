import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// GET /api/users/me/invitations
// Returns the authenticated user's pending organization invitations (matched
// by email), and backfills an in-app notification for any that don't have
// one yet — covers invites sent before the recipient had an account.
export async function GET() {
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
  if (!user || !user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const email = user.email.toLowerCase();
  const now = new Date().toISOString();

  // Mark expired invitations
  await service
    .from('organization_invitations')
    .update({ status: 'expired', updated_at: now })
    .eq('email', email)
    .eq('status', 'pending')
    .lt('expires_at', now);

  const { data: invites, error } = await service
    .from('organization_invitations')
    .select('id, token, role, invited_by, expires_at, organizations(name, logo_url)')
    .eq('email', email)
    .eq('status', 'pending')
    .gt('expires_at', now)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!invites || invites.length === 0) return NextResponse.json([]);

  // Inviter display names
  const inviterIds = [...new Set(invites.map((inv: any) => inv.invited_by))];
  const nameMap: Record<string, string> = {};
  await Promise.all(inviterIds.map(async (id) => {
    const { data } = await service.auth.admin.getUserById(id);
    nameMap[id] = data?.user?.user_metadata?.full_name || data?.user?.email || 'A team member';
  }));

  // Backfill notifications for invites that don't have one yet
  const links = invites.map((inv: any) => `/invite/${inv.token}`);
  const { data: existingNotifs } = await service
    .from('notifications')
    .select('link')
    .eq('user_id', user.id)
    .eq('type', 'org_invitation')
    .in('link', links);
  const existingLinks = new Set((existingNotifs ?? []).map((n: any) => n.link));

  const toInsert = invites
    .filter((inv: any) => !existingLinks.has(`/invite/${inv.token}`))
    .map((inv: any) => ({
      user_id: user.id,
      type:    'org_invitation',
      title:   `You've been invited to join ${inv.organizations?.name ?? 'an organization'}`,
      body:    `${nameMap[inv.invited_by]} invited you to join ${inv.organizations?.name ?? 'an organization'} as ${inv.role}. Click to view the invitation.`,
      link:    `/invite/${inv.token}`,
    }));

  if (toInsert.length > 0) {
    await service.from('notifications').insert(toInsert);
  }

  return NextResponse.json(invites.map((inv: any) => ({
    id:         inv.id,
    token:      inv.token,
    role:       inv.role,
    expires_at: inv.expires_at,
    inviter_name: nameMap[inv.invited_by],
    organization: inv.organizations,
  })));
}
