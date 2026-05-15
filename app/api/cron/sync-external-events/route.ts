import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncEvent, importEvents } from '@/lib/platforms/sync';
import { lumaListEvents, mapLumaEvent } from '@/lib/platforms/luma';
import { eventbriteListEvents, mapEventbriteEvent } from '@/lib/platforms/eventbrite';

// GET /api/cron/sync-external-events
// Called nightly by Vercel Cron. Syncs all imported events and auto-imports new ones.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: connections } = await service
    .from('platform_connections')
    .select('id, organization_id, platform, access_token, external_org_id, sync_new_events');

  if (!connections || connections.length === 0) {
    return NextResponse.json({ synced: 0, newImports: 0, errors: 0 });
  }

  let totalSynced = 0;
  let totalNewImports = 0;
  let totalErrors = 0;

  for (const conn of connections) {
    try {
      // Fetch all events from the external platform
      let platformEvents: any[] = [];
      if (conn.platform === 'luma') {
        const raw = await lumaListEvents(conn.access_token);
        platformEvents = raw.map(e => ({ mapped: mapLumaEvent(e), external_id: e.api_id }));
      } else {
        const raw = await eventbriteListEvents(conn.access_token, conn.external_org_id!);
        platformEvents = raw.map(e => ({ mapped: mapEventbriteEvent(e), external_id: e.id }));
      }

      const externalIds = platformEvents.map(e => e.external_id);

      // Auto-import new events if enabled
      if (conn.sync_new_events && externalIds.length > 0) {
        const { data: existing } = await service
          .from('events').select('external_id')
          .eq('organization_id', conn.organization_id)
          .eq('platform_source', conn.platform)
          .in('external_id', externalIds);

        const existingSet = new Set((existing ?? []).map((e: any) => e.external_id));
        const newIds = externalIds.filter(id => !existingSet.has(id));

        if (newIds.length > 0) {
          const { imported: n } = await importEvents(service, conn.organization_id, conn, newIds);
          totalNewImports += n;
        }
      }

      // Sync already-imported events that haven't ended (+ 7-day window)
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const { data: importedEvents } = await service
        .from('events')
        .select('id, organization_id, external_id, platform_source, title, date, end_date, time, location, description, online_url, platform_image, is_private_on_platform, sync_fail_count')
        .eq('organization_id', conn.organization_id)
        .eq('platform_source', conn.platform)
        .in('external_id', externalIds)
        .gte('end_date', cutoff);

      // Also include single-day events not yet passed
      const { data: singleDayEvents } = await service
        .from('events')
        .select('id, organization_id, external_id, platform_source, title, date, end_date, time, location, description, online_url, platform_image, is_private_on_platform, sync_fail_count')
        .eq('organization_id', conn.organization_id)
        .eq('platform_source', conn.platform)
        .in('external_id', externalIds)
        .is('end_date', null)
        .gte('date', cutoff);

      const eventsToSync = [...(importedEvents ?? []), ...(singleDayEvents ?? [])];

      for (const event of eventsToSync) {
        const { changed, error: syncError } = await syncEvent(service, event, conn);

        if (syncError) {
          totalErrors++;

          // Notify on 3 consecutive failures
          if ((event.sync_fail_count ?? 0) + 1 >= 3) {
            const [{ data: orgAdmins }, { data: eventAdmins }] = await Promise.all([
              service.from('organization_admins').select('user_id')
                .eq('organization_id', conn.organization_id).in('role', ['owner', 'admin']),
              service.from('event_admin_assignments').select('user_id')
                .eq('event_id', event.id).eq('status', 'active')
                .gt('expires_at', new Date().toISOString()),
            ]);

            const recipients = new Set([
              ...(orgAdmins ?? []).map((r: any) => r.user_id),
              ...(eventAdmins ?? []).map((r: any) => r.user_id),
            ]);

            if (recipients.size > 0) {
              await service.from('notifications').insert(
                Array.from(recipients).map(userId => ({
                  user_id: userId,
                  type:    'event_sync_failed',
                  title:   `Sync failed for "${event.title}"`,
                  body:    `We've been unable to sync this event from ${conn.platform} for 3 consecutive attempts. Check your connection in org settings.`,
                  link:    `/admin/events/${event.id}`,
                }))
              );
            }
          }
          continue;
        }

        if (changed.length > 0) {
          totalSynced++;

          const fieldLabels: Record<string, string> = {
            title: 'Event name', date: 'Date', end_date: 'End date', time: 'Time',
            location: 'Location', description: 'Description', online_url: 'Online URL',
            platform_image: 'Cover image',
          };
          const fieldList = changed.map(f => fieldLabels[f] ?? f).join(', ');

          const [{ data: orgAdmins }, { data: eventAdmins }] = await Promise.all([
            service.from('organization_admins').select('user_id')
              .eq('organization_id', conn.organization_id).in('role', ['owner', 'admin']),
            service.from('event_admin_assignments').select('user_id')
              .eq('event_id', event.id).eq('status', 'active')
              .gt('expires_at', new Date().toISOString()),
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
                body:    `Synced from ${conn.platform}: ${fieldList}`,
                link:    `/admin/events/${event.id}`,
              }))
            );
          }
        }
      }
    } catch (err: any) {
      console.error(`sync-external-events: connection ${conn.id} failed:`, err.message);
      totalErrors++;
    }
  }

  return NextResponse.json({ synced: totalSynced, newImports: totalNewImports, errors: totalErrors });
}
