import type { SupabaseClient } from '@supabase/supabase-js';
import { lumaGetEvent, mapLumaEvent } from './luma';
import { eventbriteGetEvent, mapEventbriteEvent } from './eventbrite';

const SYNCABLE_FIELDS = ['title', 'date', 'end_date', 'time', 'location', 'description', 'online_url', 'platform_image'] as const;

type SyncableField = typeof SYNCABLE_FIELDS[number];

interface PlatformConnection {
  platform: 'luma' | 'eventbrite';
  access_token: string;
  external_org_id: string | null;
}

interface EventRow {
  id: string;
  external_id: string;
  platform_source: 'luma' | 'eventbrite';
  organization_id: string;
  [key: string]: any;
}

export async function syncEvent(
  service: SupabaseClient,
  event: EventRow,
  connection: PlatformConnection
): Promise<{ changed: string[]; error?: string }> {
  try {
    let mapped: ReturnType<typeof mapLumaEvent> | ReturnType<typeof mapEventbriteEvent>;

    if (connection.platform === 'luma') {
      const raw = await lumaGetEvent(connection.access_token, event.external_id);
      mapped = mapLumaEvent(raw);
    } else {
      const raw = await eventbriteGetEvent(connection.access_token, event.external_id);
      mapped = mapEventbriteEvent(raw);
    }

    const changed: string[] = [];
    const updates: Record<string, any> = {};

    for (const field of SYNCABLE_FIELDS) {
      const newVal = (mapped as any)[field] ?? null;
      const oldVal = event[field] ?? null;
      if (newVal !== oldVal) {
        changed.push(field);
        updates[field] = newVal;
      }
    }

    updates.is_private_on_platform = mapped.is_private_on_platform;
    updates.last_synced_at = new Date().toISOString();
    updates.sync_status = 'synced';
    updates.sync_fail_count = 0;

    await service.from('events').update(updates).eq('id', event.id);

    return { changed };
  } catch (err: any) {
    const { data: current } = await service
      .from('events')
      .select('sync_fail_count')
      .eq('id', event.id)
      .single();

    await service.from('events').update({
      sync_status:     'failed',
      last_synced_at:  new Date().toISOString(),
      sync_fail_count: (current?.sync_fail_count ?? 0) + 1,
    }).eq('id', event.id);

    return { changed: [], error: err.message };
  }
}

export interface ImportResult {
  imported: number;
  skipped: { externalId: string; reason: string }[];
}

export async function importEvents(
  service: SupabaseClient,
  orgId: string,
  connection: PlatformConnection,
  externalIds: string[]
): Promise<ImportResult> {
  let imported = 0;
  const skipped: ImportResult['skipped'] = [];

  // Check org plan once — needed to gate multi-day imports
  const { data: orgData } = await service
    .from('organizations').select('plan').eq('id', orgId).single();
  const isPaid = orgData?.plan && orgData.plan !== 'free';

  for (const externalId of externalIds) {
    try {
      let mapped: ReturnType<typeof mapLumaEvent> | ReturnType<typeof mapEventbriteEvent>;

      if (connection.platform === 'luma') {
        const raw = await lumaGetEvent(connection.access_token, externalId);
        mapped = mapLumaEvent(raw);
      } else {
        const raw = await eventbriteGetEvent(connection.access_token, externalId);
        mapped = mapEventbriteEvent(raw);
      }

      // Block multi-day imports for free orgs
      if (mapped.end_date && !isPaid) {
        skipped.push({ externalId, reason: 'multi_day_requires_paid' });
        continue;
      }

      // Generate a URL-safe slug
      const slug = `${mapped.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${Date.now()}`;

      const { error } = await service.from('events').insert({
        ...mapped,
        event_id:        slug,
        organization_id: orgId,
        status:          'active',
        co_sponsors:     [],
        sync_status:     'synced',
        last_synced_at:  new Date().toISOString(),
      });

      // Conflict = already imported — skip silently
      if (!error || error.code === '23505') {
        if (!error) imported++;
      }
    } catch {
      // Skip individual failures — don't abort the batch
    }
  }

  return { imported, skipped };
}
