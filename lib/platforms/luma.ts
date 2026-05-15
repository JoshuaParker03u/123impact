const LUMA_BASE = 'https://api.lu.ma/public/v1';

export interface LumaEvent {
  api_id: string;
  name: string;
  start_at: string;
  end_at: string;
  geo_address_info?: { full_address?: string };
  description?: string;
  url?: string;
  cover_url?: string;
  visibility?: 'public' | 'private' | 'password';
}

export interface MappedEvent {
  external_id: string;
  title: string;
  date: string;
  end_date: string | null;
  time: string;
  location: string;
  description: string | null;
  online_url: string | null;
  platform_image: string | null;
  is_private_on_platform: boolean;
  platform_source: 'luma';
}

async function lumaFetch(apiKey: string, path: string) {
  const res = await fetch(`${LUMA_BASE}${path}`, {
    headers: { 'x-luma-api-key': apiKey },
  });
  if (!res.ok) throw new Error(`Luma API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function lumaValidateKey(apiKey: string): Promise<boolean> {
  try {
    await lumaFetch(apiKey, '/calendar/list-events?pagination_limit=1');
    return true;
  } catch {
    return false;
  }
}

export async function lumaListEvents(apiKey: string): Promise<LumaEvent[]> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const events: LumaEvent[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ pagination_limit: '50', after: since });
    if (cursor) params.set('pagination_cursor', cursor);
    const data = await lumaFetch(apiKey, `/calendar/list-events?${params}`);
    events.push(...(data.entries ?? []).map((e: any) => e.event));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return events;
}

export async function lumaGetEvent(apiKey: string, eventId: string): Promise<LumaEvent> {
  const data = await lumaFetch(apiKey, `/event/get?event_id=${eventId}`);
  return data.event;
}

export function mapLumaEvent(e: LumaEvent): MappedEvent {
  const start = new Date(e.start_at);
  const end   = new Date(e.end_at);
  const startDate = start.toISOString().split('T')[0];
  const endDate   = end.toISOString().split('T')[0];

  return {
    external_id:             e.api_id,
    title:                   e.name,
    date:                    startDate,
    end_date:                endDate !== startDate ? endDate : null,
    time:                    start.toTimeString().slice(0, 5),
    location:                e.geo_address_info?.full_address ?? '',
    description:             e.description ?? null,
    online_url:              e.url ?? null,
    platform_image:          e.cover_url ?? null,
    is_private_on_platform:  e.visibility !== 'public',
    platform_source:         'luma',
  };
}
