import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { lumaListEvents, mapLumaEvent } from '@/lib/platforms/luma';
import { eventbriteListEvents, mapEventbriteEvent } from '@/lib/platforms/eventbrite';

type Params = { params: Promise<{ id: string }> };

// GET /api/organizations/[id]/platform-events?platform=luma|eventbrite
// Returns events from the external platform, annotated with already-imported status.
export async function GET(req: NextRequest, { params }: Params) {
  const { id: orgId } = await params;
  const platform = req.nextUrl.searchParams.get('platform') as 'luma' | 'eventbrite' | null;
  if (!platform || !['luma', 'eventbrite'].includes(platform)) {
    return NextResponse.json({ error: 'platform must be luma or eventbrite' }, { status: 400 });
  }

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

  const { data: connection } = await service
    .from('platform_connections').select('access_token, external_org_id')
    .eq('organization_id', orgId).eq('platform', platform).single();
  if (!connection) return NextResponse.json({ error: 'Platform not connected' }, { status: 404 });

  // Fetch already-imported external IDs for this org + platform
  const { data: imported } = await service
    .from('events').select('external_id')
    .eq('organization_id', orgId).eq('platform_source', platform);
  const importedSet = new Set((imported ?? []).map((e: any) => e.external_id));

  let events: any[];
  if (platform === 'luma') {
    const raw = await lumaListEvents(connection.access_token);
    events = raw.map(e => ({ ...mapLumaEvent(e), already_imported: importedSet.has(e.api_id) }));
  } else {
    const raw = await eventbriteListEvents(connection.access_token, connection.external_org_id!);
    events = raw.map(e => ({ ...mapEventbriteEvent(e), already_imported: importedSet.has(e.id) }));
  }

  return NextResponse.json({ events });
}
