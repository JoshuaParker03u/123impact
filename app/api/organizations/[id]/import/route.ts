import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { importEvents } from '@/lib/platforms/sync';

type Params = { params: Promise<{ id: string }> };

// POST /api/organizations/[id]/import
// Body: { platform: 'luma'|'eventbrite', external_ids: string[], sync_new_events: boolean }
export async function POST(req: NextRequest, { params }: Params) {
  const { id: orgId } = await params;

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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: membership } = await service
    .from('organization_admins').select('role')
    .eq('organization_id', orgId).eq('user_id', user.id).single();
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { platform, external_ids, sync_new_events } = body;

  if (!platform || !['luma', 'eventbrite'].includes(platform)) {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
  }
  if (!Array.isArray(external_ids) || external_ids.length === 0) {
    return NextResponse.json({ error: 'external_ids must be a non-empty array' }, { status: 400 });
  }

  const { data: connection } = await service
    .from('platform_connections').select('access_token, external_org_id')
    .eq('organization_id', orgId).eq('platform', platform).single();
  if (!connection) return NextResponse.json({ error: 'Platform not connected' }, { status: 404 });

  const imported = await importEvents(service, orgId, { platform, ...connection }, external_ids);

  // Update sync_new_events setting
  if (typeof sync_new_events === 'boolean') {
    await service.from('platform_connections')
      .update({ sync_new_events })
      .eq('organization_id', orgId)
      .eq('platform', platform);
  }

  return NextResponse.json({ imported });
}
