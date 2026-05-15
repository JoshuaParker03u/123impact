import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { syncEvent } from '@/lib/platforms/sync';

type Params = { params: Promise<{ id: string }> };

// POST /api/events/[id]/sync
// Force-syncs a single imported event from its source platform.
// Auth: org admin/owner or active event admin.
export async function POST(_req: NextRequest, { params }: Params) {
  const { id: eventId } = await params;

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

  const { data: event } = await service
    .from('events')
    .select('id, organization_id, external_id, platform_source, title, date, end_date, time, location, description, online_url, platform_image, is_private_on_platform')
    .eq('id', eventId)
    .single();

  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  if (!event.platform_source || !event.external_id) {
    return NextResponse.json({ error: 'Event is not imported from an external platform' }, { status: 400 });
  }

  const [{ data: orgMembership }, { data: eventAdmin }] = await Promise.all([
    service.from('organization_admins').select('role')
      .eq('organization_id', event.organization_id).eq('user_id', user.id).maybeSingle(),
    service.from('event_admin_assignments').select('id')
      .eq('event_id', eventId).eq('user_id', user.id).eq('status', 'active')
      .gt('expires_at', new Date().toISOString()).maybeSingle(),
  ]);

  const isOrgAdmin = orgMembership && ['owner', 'admin'].includes(orgMembership.role);
  if (!isOrgAdmin && !eventAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: connection } = await service
    .from('platform_connections').select('platform, access_token, external_org_id')
    .eq('organization_id', event.organization_id).eq('platform', event.platform_source).single();

  if (!connection) {
    return NextResponse.json({ error: 'Platform account is no longer connected' }, { status: 400 });
  }

  const { changed, error: syncError } = await syncEvent(service, event, connection);

  if (syncError) {
    return NextResponse.json({ error: syncError }, { status: 502 });
  }

  // Notify org owners + event admins if fields changed
  if (changed.length > 0) {
    const fieldLabels: Record<string, string> = {
      title: 'Event name', date: 'Date', end_date: 'End date', time: 'Time',
      location: 'Location', description: 'Description', online_url: 'Online URL',
      platform_image: 'Cover image',
    };
    const fieldList = changed.map(f => fieldLabels[f] ?? f).join(', ');
    const body = `The following fields were updated from ${event.platform_source}: ${fieldList}`;

    const [{ data: orgAdmins }, { data: eventAdmins }] = await Promise.all([
      service.from('organization_admins').select('user_id')
        .eq('organization_id', event.organization_id).in('role', ['owner', 'admin']),
      service.from('event_admin_assignments').select('user_id')
        .eq('event_id', eventId).eq('status', 'active').gt('expires_at', new Date().toISOString()),
    ]);

    const recipients = new Set([
      ...(orgAdmins ?? []).map((r: any) => r.user_id),
      ...(eventAdmins ?? []).map((r: any) => r.user_id),
    ]);

    if (recipients.size > 0) {
      await service.from('notifications').insert(
        Array.from(recipients).map(userId => ({
          user_id: userId,
          type:    'event_synced',
          title:   `"${event.title}" was updated`,
          body,
          link:    `/admin/events/${eventId}`,
        }))
      );
    }
  }

  const { data: updated } = await service
    .from('events').select('last_synced_at, sync_status').eq('id', eventId).single();

  return NextResponse.json({ changed, lastSyncedAt: updated?.last_synced_at });
}
