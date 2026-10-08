// Regression test for a real staging bug: GET events.json returned an empty
// events array for a real org, because every one of its (real, live)
// multi-day events has events.time = '' -- not bad data, components/admin/
// EventModal.jsx intentionally leaves it blank once per-day custom hours are
// set in event_day_hours instead. The feed treated the blank top-level time
// as unparseable and silently dropped every event. Day hours must win
// whenever present, matching the precedence app/admin/events/[id]/page.tsx's
// own formatScheduleSummary already uses.
import { describe, it, expect } from 'vitest';
import { resolveEventWindow } from '@/lib/public-feed/resolve-event-window';

describe('resolveEventWindow', () => {
  it('uses the first day\'s start and last day\'s end when day hours exist (the actual staging bug)', () => {
    const result = resolveEventWindow({
      date: '2027-02-01',
      time: '', // left blank -- this is the real-world shape that broke
      end_date: '2027-02-03',
      timezone: 'America/New_York',
      dayHours: [
        { event_date: '2027-02-01', start_time: '09:00', end_time: '18:00' },
        { event_date: '2027-02-02', start_time: '09:00', end_time: '20:00' },
        { event_date: '2027-02-03', start_time: '09:00', end_time: '15:00' },
      ],
    });
    expect(result?.start.toISOString()).toBe('2027-02-01T14:00:00.000Z'); // 09:00 EST
    expect(result?.end.toISOString()).toBe('2027-02-03T20:00:00.000Z');   // 15:00 EST
  });

  it('sorts day hours by date rather than trusting row order', () => {
    const result = resolveEventWindow({
      date: '2027-02-01',
      time: '',
      end_date: '2027-02-03',
      timezone: 'UTC',
      dayHours: [
        { event_date: '2027-02-03', start_time: '09:00', end_time: '15:00' },
        { event_date: '2027-02-01', start_time: '10:00', end_time: '18:00' },
      ],
    });
    expect(result?.start.toISOString()).toBe('2027-02-01T10:00:00.000Z');
    expect(result?.end.toISOString()).toBe('2027-02-03T15:00:00.000Z');
  });

  it('falls back to date/time when there are no day hours', () => {
    const result = resolveEventWindow({
      date: '2027-01-15', time: '16:45', end_date: null, timezone: 'UTC', dayHours: [],
    });
    expect(result?.start.toISOString()).toBe('2027-01-15T16:45:00.000Z');
  });

  it('returns null, not a crash, when both day hours and date/time are unusable', () => {
    const result = resolveEventWindow({
      date: '2027-01-15', time: '', end_date: null, timezone: 'UTC', dayHours: [],
    });
    expect(result).toBeNull();
  });
});
