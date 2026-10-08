// Single place that fetches + shapes an org's public feed data, so the JSON
// and iCal routes can never disagree on what's included (consent filtering,
// status derivation, URL resolution all happen here exactly once).
import { createClient } from '@supabase/supabase-js';
import { fromZonedTime } from 'date-fns-tz';
import { deriveFeedStatus, type StoredEventStatus } from './derive-status';
import type { FeedEvent, FeedPerson, FeedSession, FeedSessionPerson, OrgFeedData } from './types';

// events.date/time (and panels.panel_date/start_time/end_time) are stored as
// plain wall-clock values in the org's own timezone, not UTC — convert using
// the org's declared timezone (falling back to UTC when unset) rather than
// letting the JS Date constructor guess from the server process's own TZ.
function toInstant(dateStr: string, timeStr: string, timeZone: string | null): Date {
  return fromZonedTime(`${dateStr}T${timeStr}:00`, timeZone ?? 'UTC');
}

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
  const now = new Date();
  const feedEvents: FeedEvent[] = [];

  for (const event of events ?? []) {
    const eventStart = toInstant(event.date, event.time, org.timezone);
    const eventEnd = toInstant(event.end_date ?? event.date, '23:59', org.timezone);
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

    const sessions: FeedSession[] = (panels ?? []).map(panel => {
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

      const sessionDate = panel.panel_date ?? event.date;
      return {
        id: panel.id,
        title: panel.name,
        description: panel.description,
        starts: toInstant(sessionDate, panel.start_time, org.timezone),
        ends: toInstant(sessionDate, panel.end_time, org.timezone),
        location: panel.location,
        online_url: panel.online_url,
        streamed: panel.online_url !== null,
        people: sessionPeople,
      };
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
    time_zone: org.timezone,
    events: feedEvents,
  };
}
