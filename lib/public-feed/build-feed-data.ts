// Single place that fetches + shapes an org's public feed data, so the JSON
// and iCal routes can never disagree on what's included (consent filtering,
// status derivation, URL resolution all happen here exactly once).
import { createClient } from '@supabase/supabase-js';
import { deriveFeedStatus, type StoredEventStatus } from './derive-status';
import { resolveEventWindow } from './resolve-event-window';
import { toInstant } from './to-instant';
import type { FeedEvent, FeedPerson, FeedSession, FeedSessionPerson, OrgFeedData } from './types';

function buildServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function resolveBaseUrl(service: ReturnType<typeof buildServiceClient>, organizationId: string): Promise<string> {
  const { data: domain } = await service
    .from('org_custom_domains')
    .select('subdomain')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .maybeSingle();

  return domain ? `https://${domain.subdomain}` : (process.env.NEXT_PUBLIC_APP_URL ?? 'https://123impact.org');
}

export async function buildOrgFeedData(organizationId: string): Promise<OrgFeedData | null> {
  const service = buildServiceClient();

  const { data: org } = await service
    .from('organizations')
    .select('id, name, timezone')
    .eq('id', organizationId)
    .maybeSingle();
  if (!org) return null;

  const [{ data: events }, baseUrl, { data: connection }] = await Promise.all([
    service
      .from('events')
      .select('id, event_id, title, description, date, time, end_date, status, image_url, platform_image, location, online_url, recording_url')
      .eq('organization_id', organizationId)
      .neq('status', 'deleted')
      .order('date', { ascending: true }),
    resolveBaseUrl(service, organizationId),
    service
      .from('platform_connections')
      .select('external_org_name')
      .eq('organization_id', organizationId)
      .eq('platform', 'discord')
      .maybeSingle(),
  ]);

  const venueName = connection?.external_org_name ?? null;
  const timezone = org.timezone;
  const now = new Date();
  const feedEvents: FeedEvent[] = [];

  // Multi-day events can set custom per-day hours (components/admin/EventModal.jsx
  // writes these to event_day_hours), in which case events.time is left blank —
  // it's not stale data to skip, it's a second, authoritative source of
  // scheduling info. Mirrors the precedence formatScheduleSummary (in
  // app/admin/events/[id]/page.tsx) already uses: day hours win whenever
  // present, events.date/time is only the fallback when there are none.
  const eventIds = (events ?? []).map(e => e.id);
  const { data: dayHours } = eventIds.length
    ? await service
        .from('event_day_hours')
        .select('event_id, event_date, start_time, end_time')
        .in('event_id', eventIds)
    : { data: [] };

  const dayHoursByEvent = new Map<string, { event_date: string; start_time: string; end_time: string }[]>();
  for (const row of dayHours ?? []) {
    const list = dayHoursByEvent.get(row.event_id) ?? [];
    list.push(row);
    dayHoursByEvent.set(row.event_id, list);
  }

  function windowFor(event: { id: string; date: string; time: string; end_date: string | null }): { start: Date; end: Date } | null {
    return resolveEventWindow({
      date: event.date,
      time: event.time,
      end_date: event.end_date,
      timezone,
      dayHours: dayHoursByEvent.get(event.id) ?? [],
    });
  }

  for (const event of events ?? []) {
    const window = windowFor(event);
    if (!window) {
      console.error(`public-feed: skipping event ${event.id} — unparseable date/time (date=${event.date}, time=${event.time})`);
      continue;
    }
    const { start: eventStart, end: eventEnd } = window;
    const status = deriveFeedStatus({
      status: (event.status ?? 'active') as StoredEventStatus,
      start: eventStart,
      end: eventEnd,
      now,
    });
    if (status === null) continue; // excluded (shouldn't happen given neq('status','deleted'), kept defensive)

    const [{ data: panels }, { data: registrations }] = await Promise.all([
      service
        .from('panels')
        .select('id, name, description, start_time, end_time, panel_date, location, online_url')
        .eq('event_id', event.id),
      service
        .from('volunteer_registrations')
        .select('id, name, speaker_bio, speaker_topic, photo_url, panel_id, attendee_type, public_consent')
        .eq('event_id', event.id)
        .eq('attendee_type', 'speaker')
        .eq('public_consent', true),
    ]);

    const panelIds = (panels ?? []).map(p => p.id);
    const { data: assignments } = panelIds.length
      ? await service
          .from('panel_assignments')
          .select('panel_id, role, registration:volunteer_registrations(id, name, speaker_bio, speaker_topic, photo_url, public_consent)')
          .in('panel_id', panelIds)
          .in('role', ['speaker', 'moderator'])
      : { data: [] };

    const peopleById = new Map<string, FeedPerson>();
    const addPerson = (reg: { id: string; name: string; speaker_bio: string | null; speaker_topic: string | null; photo_url: string | null }) => {
      if (!peopleById.has(reg.id)) {
        peopleById.set(reg.id, { id: reg.id, name: reg.name, bio: reg.speaker_bio, photo: reg.photo_url, topic: reg.speaker_topic });
      }
    };

    for (const reg of registrations ?? []) addPerson(reg);
    for (const a of assignments ?? []) {
      const reg = a.registration as unknown as { id: string; name: string; speaker_bio: string | null; speaker_topic: string | null; photo_url: string | null; public_consent: boolean } | null;
      if (reg?.public_consent) addPerson(reg);
    }

    const sessions: FeedSession[] = (panels ?? []).flatMap(panel => {
      const sessionDate = panel.panel_date ?? event.date;
      const sessionStart = toInstant(sessionDate, panel.start_time, timezone);
      const sessionEnd = toInstant(sessionDate, panel.end_time, timezone);
      if (!sessionStart || !sessionEnd) {
        console.error(`public-feed: skipping session ${panel.id} — unparseable date/time (date=${sessionDate}, start=${panel.start_time}, end=${panel.end_time})`);
        return [];
      }

      const sessionPeople: FeedSessionPerson[] = [];
      const seen = new Set<string>();

      for (const reg of registrations ?? []) {
        if (reg.panel_id === panel.id && !seen.has(reg.id)) {
          seen.add(reg.id);
          sessionPeople.push({ person: reg.id, role: 'speaker' });
        }
      }
      for (const a of assignments ?? []) {
        if (a.panel_id !== panel.id) continue;
        const reg = a.registration as unknown as { id: string; public_consent: boolean } | null;
        if (reg?.public_consent && !seen.has(reg.id)) {
          seen.add(reg.id);
          sessionPeople.push({ person: reg.id, role: a.role as 'speaker' | 'moderator' });
        }
      }

      return [{
        id: panel.id,
        title: panel.name,
        description: panel.description,
        starts: sessionStart,
        ends: sessionEnd,
        location: panel.location,
        online_url: panel.online_url,
        streamed: panel.online_url !== null,
        people: sessionPeople,
      }];
    });

    feedEvents.push({
      id: event.event_id,
      title: event.title,
      description: event.description,
      status,
      starts: eventStart,
      ends: eventEnd,
      image: event.image_url ?? event.platform_image ?? null,
      location: event.location,
      online_url: event.online_url,
      recording_url: event.recording_url,
      apply_url: `${baseUrl}/events/${event.event_id}/signup`,
      venue_name: venueName,
      sessions,
      people: Array.from(peopleById.values()),
    });
  }

  return {
    organization_id: org.id,
    organization_name: org.name,
    time_zone: timezone,
    events: feedEvents,
  };
}
