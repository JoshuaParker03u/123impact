import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

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

// GET /api/users/me — return profile info for pre-filling forms
export async function GET() {
  const { session, service } = await buildClients();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let phone: string | null = null;
  if (user.email) {
    const { data: registration } = await service
      .from('volunteer_registrations')
      .select('phone')
      .eq('email', user.email.toLowerCase())
      .not('phone', 'is', null)
      .order('registered_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    phone = registration?.phone ?? null;
  }

  return NextResponse.json({
    full_name: user.user_metadata?.full_name ?? null,
    email: user.email ?? null,
    phone,
  });
}

// PATCH /api/users/me — update display name and/or timezone
export async function PATCH(req: NextRequest) {
  const { session, service } = await buildClients();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { full_name, timezone } = body;

  const updates: Record<string, any> = { ...user.user_metadata };
  if (full_name !== undefined) updates.full_name = full_name;
  if (timezone  !== undefined) updates.timezone  = timezone;

  const { error } = await service.auth.admin.updateUserById(user.id, { user_metadata: updates });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

// DELETE /api/users/me — delete account (blocks if sole org owner)
export async function DELETE(_req: NextRequest) {
  const { session, service } = await buildClients();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Find orgs where this user is owner
  const { data: ownerships } = await service
    .from('organization_admins')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('role', 'owner');

  for (const { organization_id } of ownerships ?? []) {
    const { count } = await service
      .from('organization_admins')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organization_id)
      .eq('role', 'owner');

    if ((count ?? 0) <= 1) {
      return NextResponse.json({
        error: 'You are the sole owner of one or more organizations. Transfer ownership before deleting your account.',
        code: 'SOLE_OWNER',
      }, { status: 400 });
    }
  }

  const { error } = await service.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
