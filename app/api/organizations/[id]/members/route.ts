import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

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

// GET /api/organizations/[id]/members
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: orgId } = await params;
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: membership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .single();

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: members, error } = await service
    .from('organization_admins')
    .select('user_id, role, permissions, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch user display info
  const { data: allUsers } = await service.auth.admin.listUsers();
  const userMap: Record<string, any> = {};
  (allUsers?.users ?? []).forEach((u: any) => { userMap[u.id] = u; });

  const enriched = (members ?? []).map((m: any) => {
    const u = userMap[m.user_id];
    return {
      user_id:    m.user_id,
      role:       m.role,
      created_at: m.created_at,
      name:       u?.user_metadata?.full_name || null,
      email:      u?.email || null,
      avatar_url: u?.user_metadata?.avatar_url || null,
    };
  });

  return NextResponse.json(enriched);
}

// PATCH /api/organizations/[id]/members
// Body: { user_id, role } — owner only, cannot change another owner's role
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: orgId } = await params;
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: membership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .single();

  if (!membership || membership.role !== 'owner') {
    return NextResponse.json({ error: 'Only owners can change member roles' }, { status: 403 });
  }

  const { user_id: targetUserId, role: newRole } = await req.json();
  if (!targetUserId || !['admin', 'member', 'owner'].includes(newRole)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (targetUserId === user.id) {
    return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 });
  }

  const { data: targetMembership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', targetUserId)
    .single();

  if (!targetMembership) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  if (targetMembership.role === 'owner') {
    return NextResponse.json({ error: 'Cannot change an owner\'s role' }, { status: 400 });
  }

  // Ownership transfer: promote target to owner, demote caller to admin atomically
  if (newRole === 'owner') {
    const [promoteRes, demoteRes] = await Promise.all([
      service
        .from('organization_admins')
        .update({ role: 'owner' })
        .eq('organization_id', orgId)
        .eq('user_id', targetUserId),
      service
        .from('organization_admins')
        .update({ role: 'admin' })
        .eq('organization_id', orgId)
        .eq('user_id', user.id),
    ]);
    if (promoteRes.error) return NextResponse.json({ error: promoteRes.error.message }, { status: 500 });
    if (demoteRes.error)  return NextResponse.json({ error: demoteRes.error.message },  { status: 500 });
    return NextResponse.json({ transferred: true });
  }

  const { data, error } = await service
    .from('organization_admins')
    .update({ role: newRole })
    .eq('organization_id', orgId)
    .eq('user_id', targetUserId)
    .select('user_id, role')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/organizations/[id]/members?user_id=...
// Owners only — remove a member from the org.
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id: orgId } = await params;
  const { session, service } = await buildClients();

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: membership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .single();

  if (!membership || membership.role !== 'owner') {
    return NextResponse.json({ error: 'Only owners can remove members' }, { status: 403 });
  }

  const targetUserId = new URL(req.url).searchParams.get('user_id');
  if (!targetUserId) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });

  // Cannot remove yourself
  if (targetUserId === user.id) {
    return NextResponse.json({ error: 'Cannot remove yourself from the organization' }, { status: 400 });
  }

  // Cannot remove another owner
  const { data: targetMembership } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', targetUserId)
    .single();

  if (targetMembership?.role === 'owner') {
    return NextResponse.json({ error: 'Cannot remove an owner' }, { status: 400 });
  }

  const { error } = await service
    .from('organization_admins')
    .delete()
    .eq('organization_id', orgId)
    .eq('user_id', targetUserId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
