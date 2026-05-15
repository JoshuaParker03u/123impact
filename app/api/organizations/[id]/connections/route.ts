import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { lumaValidateKey } from '@/lib/platforms/luma';

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

// GET /api/organizations/[id]/connections
// Returns connection status for both platforms (tokens redacted)
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: orgId } = await params;
  const cookieStore = await cookies();
  const { session, service } = makeClients(cookieStore);

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await requireOrgAdmin(service, user.id, orgId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: rows } = await service
    .from('platform_connections')
    .select('platform, sync_new_events, connected_at, external_org_id')
    .eq('organization_id', orgId);

  const connections = { luma: null as any, eventbrite: null as any };
  for (const row of rows ?? []) {
    connections[row.platform as 'luma' | 'eventbrite'] = {
      connected:       true,
      sync_new_events: row.sync_new_events,
      connected_at:    row.connected_at,
    };
  }

  return NextResponse.json(connections);
}

// POST /api/organizations/[id]/connections
// Body: { platform: 'luma', api_key: string } | { platform: 'eventbrite', sync_new_events: boolean }
// For Luma: validates and stores API key
// For Eventbrite sync_new_events update: patches existing connection
export async function POST(req: NextRequest, { params }: Params) {
  const { id: orgId } = await params;
  const cookieStore = await cookies();
  const { session, service } = makeClients(cookieStore);

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await requireOrgAdmin(service, user.id, orgId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { platform } = body;

  if (platform === 'luma') {
    const apiKey: string = body.api_key?.trim();
    if (!apiKey) return NextResponse.json({ error: 'api_key is required' }, { status: 400 });

    const valid = await lumaValidateKey(apiKey);
    if (!valid) return NextResponse.json({ error: 'Invalid Luma API key' }, { status: 400 });

    const { error } = await service.from('platform_connections').upsert({
      organization_id: orgId,
      platform:        'luma',
      access_token:    apiKey,
      connected_by:    user.id,
      connected_at:    new Date().toISOString(),
    }, { onConflict: 'organization_id,platform' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (platform === 'eventbrite') {
    // Update sync_new_events toggle on existing Eventbrite connection
    const { sync_new_events } = body;
    const { error } = await service
      .from('platform_connections')
      .update({ sync_new_events })
      .eq('organization_id', orgId)
      .eq('platform', 'eventbrite');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
}

// PATCH /api/organizations/[id]/connections
// Body: { platform, sync_new_events: boolean }
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: orgId } = await params;
  const cookieStore = await cookies();
  const { session, service } = makeClients(cookieStore);

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await requireOrgAdmin(service, user.id, orgId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { platform, sync_new_events } = await req.json();
  const { error } = await service
    .from('platform_connections')
    .update({ sync_new_events })
    .eq('organization_id', orgId)
    .eq('platform', platform);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE /api/organizations/[id]/connections
// Body: { platform }
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id: orgId } = await params;
  const cookieStore = await cookies();
  const { session, service } = makeClients(cookieStore);

  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await requireOrgAdmin(service, user.id, orgId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { platform } = await req.json();
  const { error } = await service
    .from('platform_connections')
    .delete()
    .eq('organization_id', orgId)
    .eq('platform', platform);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
