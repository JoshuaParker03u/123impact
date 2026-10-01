import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { listGuildChannels } from '@/lib/discord/api';

type Params = { params: Promise<{ id: string }> };

function makeClients(cookieStore: Awaited<ReturnType<typeof cookies>>) {
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

async function requireOrgAdmin(service: any, userId: string, orgId: string) {
  const { data } = await service
    .from('organization_admins')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .single();
  return data && ['owner', 'admin'].includes(data.role);
}

// GET /api/organizations/[id]/discord/channels
// Lists the connected guild's text channels, for the command-channel picker.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: orgId } = await params;
  const cookieStore = await cookies();
  const { session, service } = makeClients(cookieStore);

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await requireOrgAdmin(service, user.id, orgId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: connection } = await service
    .from('platform_connections')
    .select('external_org_id')
    .eq('organization_id', orgId)
    .eq('platform', 'discord')
    .maybeSingle();

  if (!connection?.external_org_id) {
    return NextResponse.json({ error: 'Discord is not connected for this organization' }, { status: 400 });
  }

  try {
    const channels = await listGuildChannels(connection.external_org_id);
    return NextResponse.json(channels);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
