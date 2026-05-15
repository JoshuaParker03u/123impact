const EB_BASE = 'https://www.eventbriteapi.com/v3';

export interface EBEvent {
  id: string;
  name: { text: string };
  start: { utc: string; local: string };
  end: { utc: string; local: string };
  venue?: { address?: { localized_address_display?: string } };
  description?: { text: string };
  url?: string;
  logo?: { url?: string };
  is_private?: boolean;
  listed?: boolean;
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
  platform_source: 'eventbrite';
}

async function ebFetch(token: string, path: string) {
  const res = await fetch(`${EB_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Eventbrite API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function eventbriteGetOrgId(token: string): Promise<string> {
  const data = await ebFetch(token, '/users/me/organizations/');
  const orgs = data.organizations ?? [];
  if (!orgs.length) throw new Error('No Eventbrite organizations found for this account');
  return orgs[0].id as string;
}

export async function eventbriteListEvents(token: string, orgId: string): Promise<EBEvent[]> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const events: EBEvent[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      expand:      'venue,logo',
      time_filter: 'all',
      page:        String(page),
    });
    const data = await ebFetch(token, `/organizations/${orgId}/events/?${params}`);
    const filtered = (data.events ?? []).filter((e: EBEvent) => e.end.utc >= since);
    events.push(...filtered);
    hasMore = data.pagination?.has_more_items ?? false;
    page++;
  }

  return events;
}

export async function eventbriteGetEvent(token: string, eventId: string): Promise<EBEvent> {
  return ebFetch(token, `/events/${eventId}/?expand=venue,logo`);
}

export function mapEventbriteEvent(e: EBEvent): MappedEvent {
  // Use .local (event's own timezone) so times aren't shifted by server TZ
  const startDate = e.start.local.split('T')[0];
  const startTime = e.start.local.split('T')[1]?.slice(0, 5) ?? '';
  const endDate   = e.end.local.split('T')[0];

  return {
    external_id:             e.id,
    title:                   e.name.text,
    date:                    startDate,
    end_date:                endDate !== startDate ? endDate : null,
    time:                    startTime,
    location:                e.venue?.address?.localized_address_display ?? '',
    description:             e.description?.text ?? null,
    online_url:              e.url ?? null,
    platform_image:          e.logo?.url ?? null,
    is_private_on_platform:  !!(e.is_private || !e.listed),
    platform_source:         'eventbrite',
  };
}

export function buildEventbriteAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.EVENTBRITE_CLIENT_ID!,
    redirect_uri:  `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/integrations/eventbrite/callback`,
    state,
  });
  return `https://www.eventbrite.com/oauth/authorize?${params}`;
}

export async function eventbriteExchangeCode(code: string): Promise<{ access_token: string }> {
  const res = await fetch('https://www.eventbrite.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      client_id:     process.env.EVENTBRITE_CLIENT_ID!,
      client_secret: process.env.EVENTBRITE_CLIENT_SECRET!,
      redirect_uri:  `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/integrations/eventbrite/callback`,
    }),
  });
  if (!res.ok) throw new Error(`Eventbrite token exchange failed: ${await res.text()}`);
  return res.json();
}
