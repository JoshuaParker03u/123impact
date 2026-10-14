// Pure JSON-shape builder for the public events feed, split out of the
// route the same way to-ical.ts is — so the mapping (naming, venue/location
// handling) is testable with plain objects, no DB, no mocking.
import type { OrgFeedData } from './types';

export function buildEventsJson(data: OrgFeedData) {
  const timeZone = data.time_zone ?? 'UTC';

  return {
    schema: 'ngu.events.v1',
    generated: new Date().toISOString(),
    events: data.events.map(event => ({
      id: event.id,
      name: event.title,
      status: event.status,
      starts: event.starts.toISOString(),
      ends: event.ends.toISOString(),
      time_zone: timeZone,
      summary: event.description?.slice(0, 200) ?? null,
      description: event.description,
      image: event.image ? { url: event.image } : null,
      links: {
        apply: event.apply_url,
        join: event.online_url,
        watch: event.online_url,
        recording: event.recording_url,
      },
      venues: event.venue_name ? [{ id: 'primary', name: event.venue_name, join: event.venue_join_url }] : [],
      sessions: event.sessions.map(session => ({
        id: session.id,
        title: session.title,
        starts: session.starts.toISOString(),
        ends: session.ends.toISOString(),
        // 'venue' refers to the event's own venues[] entry (which Discord
        // server to join) — never session.location, which is a separate,
        // unrelated free-text place/room description carried in its own
        // field below. Every session falls back to the event's one venue
        // today; per-panel venues are explicitly out of scope for now (see
        // the plan: panels don't yet have their own connection to reference).
        venue: event.venue_name ? 'primary' : null,
        location: session.location,
        description: session.description,
        streamed: session.streamed,
        people: session.people,
      })),
      people: event.people,
    })),
  };
}
