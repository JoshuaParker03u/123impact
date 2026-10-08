// Regression test for a real staging gap found by spot-checking two more
// orgs: both were Eventbrite-synced, had zero panels, and their .ics came
// back as a valid-but-permanently-empty VCALENDAR -- buildIcal() only ever
// emitted a VEVENT per session (panel), and most orgs on this platform never
// use the Panels feature at all. An event with no sessions must still show
// up as its own VEVENT, or "subscribe in a calendar app" is dead for the
// common case.
import { describe, it, expect } from 'vitest';
import { buildIcal } from '@/lib/public-feed/to-ical';
import type { OrgFeedData } from '@/lib/public-feed/types';

const baseEvent = {
  id: 'plain-event',
  title: 'Plain Shift Event',
  description: 'A simple volunteer event.',
  status: 'upcoming' as const,
  starts: new Date('2027-03-01T18:00:00Z'),
  ends: new Date('2027-03-01T23:59:00Z'),
  image: null,
  location: 'Community Center',
  online_url: null,
  recording_url: null,
  apply_url: 'https://example.com/events/plain-event/signup',
  venue_name: null,
  sessions: [],
  people: [],
};

describe('buildIcal', () => {
  it('emits one VEVENT for an event with no sessions (the actual staging gap)', () => {
    const data: OrgFeedData = {
      organization_id: 'org-1', organization_name: 'Test Org', time_zone: null,
      events: [baseEvent],
    };
    const ics = buildIcal(data, 'example.com');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:plain-event@example.com');
    expect(ics).toContain('SUMMARY:Plain Shift Event');
    expect(ics).toContain('DTSTART:20270301T180000Z');
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
  });

  it('emits one VEVENT per session when sessions exist, not one for the event itself', () => {
    const data: OrgFeedData = {
      organization_id: 'org-1', organization_name: 'Test Org', time_zone: null,
      events: [{
        ...baseEvent,
        sessions: [{
          id: 'session-1', title: 'Opening Panel', description: null,
          starts: new Date('2027-03-01T19:00:00Z'), ends: new Date('2027-03-01T20:00:00Z'),
          location: null, online_url: null, streamed: false, people: [],
        }],
      }],
    };
    const ics = buildIcal(data, 'example.com');
    expect(ics).toContain('UID:session-1@example.com');
    expect(ics).not.toContain('UID:plain-event@example.com');
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
  });

  it('produces an empty-but-valid calendar for an org with no events', () => {
    const data: OrgFeedData = { organization_id: 'org-1', organization_name: 'Test Org', time_zone: null, events: [] };
    const ics = buildIcal(data, 'example.com');
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });
});
