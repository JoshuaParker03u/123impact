// Regression test for a real bug found while enriching the feed for NGU:
// sessions[].venue was mapped from session.location (free-text place/room
// description) instead of referencing the event's own venues[] entry (which
// Discord server to join) — conflating two concepts that are supposed to
// stay distinct. A session's own location is a separate field.
import { describe, it, expect } from 'vitest';
import { buildEventsJson } from '@/lib/public-feed/to-json';
import type { FeedPerson, OrgFeedData } from '@/lib/public-feed/types';

const basePerson: FeedPerson = { id: 'p-1', name: 'Speaker One', bio: null, photo: null, topic: null, pronouns: null, links: [] };

const baseSession = {
  id: 'session-1',
  title: 'Opening Panel',
  description: null,
  starts: new Date('2027-03-01T19:00:00Z'),
  ends: new Date('2027-03-01T20:00:00Z'),
  location: 'Room B',
  online_url: null,
  streamed: false,
  people: [{ person: 'p-1', role: 'speaker' as const }],
};

const baseEvent = {
  id: 'con-2027',
  title: 'The Convention',
  description: 'A convention.',
  status: 'upcoming' as const,
  starts: new Date('2027-03-01T18:00:00Z'),
  ends: new Date('2027-03-01T23:59:00Z'),
  image: null,
  location: '123 Main St',
  online_url: 'https://example.com/join',
  recording_url: null,
  apply_url: 'https://example.com/events/con-2027/signup',
  venue_name: null as string | null,
  venue_join_url: null as string | null,
  sessions: [baseSession],
  people: [basePerson],
};

function feedWith(event: Partial<typeof baseEvent>): OrgFeedData {
  return {
    organization_id: 'org-1',
    organization_name: 'Test Org',
    time_zone: null,
    events: [{ ...baseEvent, ...event }],
  };
}

describe('buildEventsJson', () => {
  it('a session keeps its own location AND references the event venue, never conflating the two', () => {
    const json = buildEventsJson(feedWith({ venue_name: 'The Forum', venue_join_url: 'https://discord.gg/abc123' }));
    const session = json.events[0].sessions[0];

    expect(session.location).toBe('Room B');
    expect(session.venue).toBe('primary');
    expect(json.events[0].venues).toEqual([{ id: 'primary', name: 'The Forum', join: 'https://discord.gg/abc123' }]);
  });

  it('a session has no venue when the event has no connected Discord guild, but still keeps its location', () => {
    const json = buildEventsJson(feedWith({ venue_name: null, venue_join_url: null }));
    const session = json.events[0].sessions[0];

    expect(session.location).toBe('Room B');
    expect(session.venue).toBeNull();
    expect(json.events[0].venues).toEqual([]);
  });

  it('venues[].join is omitted (null) when no invite link has been saved, even with a connected guild', () => {
    const json = buildEventsJson(feedWith({ venue_name: 'The Forum', venue_join_url: null }));
    expect(json.events[0].venues).toEqual([{ id: 'primary', name: 'The Forum', join: null }]);
  });

  it('passes through people with their pronouns/links enrichment', () => {
    const json = buildEventsJson(feedWith({
      people: [{ ...basePerson, pronouns: 'she/her', links: [{ label: 'Website', url: 'https://example.com' }] }],
    }));
    expect(json.events[0].people[0]).toMatchObject({ pronouns: 'she/her', links: [{ label: 'Website', url: 'https://example.com' }] });
  });
});
