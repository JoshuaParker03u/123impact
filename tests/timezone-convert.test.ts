// Unit tests for the conversion an admin's typed time goes through: their
// own personal timezone -> the org's canonical timezone (and back, for
// displaying an existing value for editing). Mirrors to-instant.test.ts's
// style, since this utility is its direct inverse.
import { describe, it, expect } from 'vitest';
import { convertWallClock, diffInDays, addDays, buildDayHoursRows, timezoneAbbreviation } from '@/lib/timezone-convert';

describe('convertWallClock', () => {
  it('is a no-op when source and target timezone are the same', () => {
    expect(convertWallClock('2026-10-15', '14:30', 'America/New_York', 'America/New_York'))
      .toEqual({ date: '2026-10-15', time: '14:30' });
  });

  it('is a no-op when both timezones are null (UTC/UTC)', () => {
    expect(convertWallClock('2026-10-15', '14:30', null, null))
      .toEqual({ date: '2026-10-15', time: '14:30' });
  });

  it('converts across a simple offset without a date rollover', () => {
    expect(convertWallClock('2026-10-15', '14:00', 'America/New_York', 'America/Chicago'))
      .toEqual({ date: '2026-10-15', time: '13:00' });
  });

  it('rolls forward a day when the converted time crosses midnight', () => {
    expect(convertWallClock('2026-10-15', '23:30', 'America/Los_Angeles', 'America/New_York'))
      .toEqual({ date: '2026-10-16', time: '02:30' });
  });

  it('rolls backward a day when the converted time crosses midnight the other way', () => {
    expect(convertWallClock('2026-10-16', '02:30', 'America/New_York', 'America/Los_Angeles'))
      .toEqual({ date: '2026-10-15', time: '23:30' });
  });

  it('round-trips exactly across a DST transition', () => {
    const forward = convertWallClock('2027-03-14', '21:30', 'UTC', 'America/New_York');
    expect(forward).toEqual({ date: '2027-03-14', time: '17:30' });
    const back = convertWallClock(forward!.date, forward!.time, 'America/New_York', 'UTC');
    expect(back).toEqual({ date: '2027-03-14', time: '21:30' });
  });

  it('returns null for an unparseable time, matching toInstant\'s contract', () => {
    expect(convertWallClock('2026-10-15', 'TBD', 'America/New_York', 'UTC')).toBeNull();
    expect(convertWallClock('2026-10-15', '', 'America/New_York', 'UTC')).toBeNull();
  });
});

describe('diffInDays / addDays', () => {
  it('computes a positive difference and adds it back correctly', () => {
    expect(diffInDays('2026-10-16', '2026-10-15')).toBe(1);
    expect(addDays('2026-10-15', 1)).toBe('2026-10-16');
  });

  it('computes a negative difference and adds it back correctly', () => {
    expect(diffInDays('2026-10-15', '2026-10-16')).toBe(-1);
    expect(addDays('2026-10-16', -1)).toBe('2026-10-15');
  });

  it('is zero for the same date', () => {
    expect(diffInDays('2026-10-15', '2026-10-15')).toBe(0);
    expect(addDays('2026-10-15', 0)).toBe('2026-10-15');
  });
});

describe('buildDayHoursRows', () => {
  it('passes through unchanged when personal and org timezone match (no rollover)', () => {
    const result = buildDayHoursRows(
      { '2026-10-15': { start_time: '09:00', end_time: '17:00' } },
      ['2026-10-15'],
      'America/Chicago', 'America/Chicago',
    );
    expect(result.error).toBeNull();
    expect(result.rows).toEqual([{ event_date: '2026-10-15', start_time: '09:00', end_time: '17:00' }]);
  });

  it('shifts a single day forward when the conversion crosses midnight', () => {
    const result = buildDayHoursRows(
      { '2026-10-15': { start_time: '23:30', end_time: '23:45' } },
      ['2026-10-15'],
      'America/Los_Angeles', 'America/New_York',
    );
    expect(result.error).toBeNull();
    expect(result.rows).toEqual([{ event_date: '2026-10-16', start_time: '02:30', end_time: '02:45' }]);
  });

  it('skips a day with no start/end time set', () => {
    const result = buildDayHoursRows(
      { '2026-10-15': { start_time: '', end_time: '' }, '2026-10-16': { start_time: '09:00', end_time: '17:00' } },
      ['2026-10-15', '2026-10-16'],
      'UTC', 'UTC',
    );
    expect(result.error).toBeNull();
    expect(result.rows).toEqual([{ event_date: '2026-10-16', start_time: '09:00', end_time: '17:00' }]);
  });

  it('refuses to save when two different days convert to the same target date', () => {
    const result = buildDayHoursRows(
      {
        '2026-10-15': { start_time: '23:30', end_time: '23:45' },
        '2026-10-16': { start_time: '01:00', end_time: '02:00' },
      },
      ['2026-10-15', '2026-10-16'],
      'America/Los_Angeles', 'America/New_York',
    );
    expect(result.rows).toBeNull();
    expect(result.error).toMatch(/2026-10-15 and 2026-10-16 both convert to 2026-10-16/);
  });
});

describe('timezoneAbbreviation', () => {
  it('returns the DST-aware abbreviation for a named zone at a given instant', () => {
    expect(timezoneAbbreviation('America/Los_Angeles', new Date('2026-07-01T00:00:00Z'))).toBe('PDT');
    expect(timezoneAbbreviation('America/Chicago', new Date('2026-07-01T00:00:00Z'))).toBe('CDT');
    expect(timezoneAbbreviation('America/Los_Angeles', new Date('2026-01-01T00:00:00Z'))).toBe('PST');
    expect(timezoneAbbreviation('America/Chicago', new Date('2026-01-01T00:00:00Z'))).toBe('CST');
  });

  it('returns UTC for null (the org-timezone-unset fallback)', () => {
    expect(timezoneAbbreviation(null, new Date('2026-07-01T00:00:00Z'))).toBe('UTC');
  });
});
