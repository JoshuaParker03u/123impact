// Regression test for a real staging 500: GET events.json for a real org
// threw "RangeError: Invalid time value" building an ISO string, because
// toInstant() blindly appended ":00" onto whatever events.time/panels.
// start_time/end_time held. This app's own admin code (formatEventTime in
// app/admin/events/[id]/page.tsx) already has to guard the same columns
// against non-"HH:MM" values — real data isn't guaranteed clean.
import { describe, it, expect } from 'vitest';
import { toInstant } from '@/lib/public-feed/to-instant';

describe('toInstant', () => {
  it('parses plain HH:MM', () => {
    const result = toInstant('2027-01-15', '18:00', 'UTC');
    expect(result?.toISOString()).toBe('2027-01-15T18:00:00.000Z');
  });

  it('parses HH:MM:SS without double-appending seconds (the actual staging bug)', () => {
    const result = toInstant('2027-01-15', '18:00:00', 'UTC');
    expect(result?.toISOString()).toBe('2027-01-15T18:00:00.000Z');
  });

  it('parses a single-digit hour', () => {
    const result = toInstant('2027-01-15', '9:00', 'UTC');
    expect(result?.toISOString()).toBe('2027-01-15T09:00:00.000Z');
  });

  it('applies the given timezone', () => {
    const result = toInstant('2027-01-15', '16:45', 'America/New_York');
    expect(result?.toISOString()).toBe('2027-01-15T21:45:00.000Z');
  });

  it('returns null, not a crash, for a non-time string', () => {
    expect(toInstant('2027-01-15', '6:00 PM', 'UTC')).toBeNull();
    expect(toInstant('2027-01-15', '', 'UTC')).toBeNull();
    expect(toInstant('2027-01-15', 'TBD', 'UTC')).toBeNull();
  });

  it('falls back to UTC when no org timezone is set', () => {
    const result = toInstant('2027-01-15', '18:00', null);
    expect(result?.toISOString()).toBe('2027-01-15T18:00:00.000Z');
  });
});
