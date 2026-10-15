import { describe, it, expect } from 'vitest';
import { resolveReminders, defaultShowtimeMessage, formatShowtimeClock } from '@/lib/discord/showtime-config';

const ctx = { name: 'Game Night', time: '7:00 PM', link: 'https://zoom.us/j/123' };

describe('defaultShowtimeMessage', () => {
  it('uses a distinct "now beginning" message at 0 minutes', () => {
    expect(defaultShowtimeMessage(0, 'Game Night')).toBe('@here Game Night is now beginning!');
  });

  it('pluralizes correctly at 1 minute vs more, with @here and the name', () => {
    expect(defaultShowtimeMessage(1, 'Game Night')).toBe('@here Game Night starts in 1 minute!');
    expect(defaultShowtimeMessage(30, 'Game Night')).toBe('@here Game Night starts in 30 minutes!');
  });
});

describe('formatShowtimeClock', () => {
  it('formats an instant as a local clock time in the given timezone', () => {
    expect(formatShowtimeClock(new Date('2026-10-20T23:00:00.000Z'), 'America/New_York')).toBe('7:00 PM');
  });

  it('falls back to UTC when no timezone is set', () => {
    expect(formatShowtimeClock(new Date('2026-10-20T19:00:00.000Z'), null)).toBe('7:00 PM');
  });
});

describe('resolveReminders', () => {
  it('resolves each reminder independently, defaulting content (with the name) when no custom message is set', () => {
    const result = resolveReminders([
      { lead_minutes: 60, message: null },
      { lead_minutes: 30, message: 'Halfway there!' },
      { lead_minutes: 0, message: null },
    ], ctx);
    expect(result).toEqual([
      { leadMinutes: 60, content: '@here Game Night starts in 60 minutes!' },
      { leadMinutes: 30, content: 'Halfway there!' },
      { leadMinutes: 0, content: '@here Game Night is now beginning!' },
    ]);
  });

  it('substitutes <name>, <minutes>, <time>, and <link> in a custom message', () => {
    const result = resolveReminders([
      { lead_minutes: 15, message: '<name> starts at <time> (in <minutes> min) -- join: <link>' },
    ], ctx);
    expect(result).toEqual([
      { leadMinutes: 15, content: 'Game Night starts at 7:00 PM (in 15 min) -- join: https://zoom.us/j/123' },
    ]);
  });

  it('substitutes case-insensitively', () => {
    const result = resolveReminders([{ lead_minutes: 5, message: '<NAME> in <Minutes>!' }], ctx);
    expect(result).toEqual([{ leadMinutes: 5, content: 'Game Night in 5!' }]);
  });

  it('substitutes <link> with an empty string when there is no online_url', () => {
    const result = resolveReminders(
      [{ lead_minutes: 5, message: 'Join here: <link>' }],
      { ...ctx, link: null },
    );
    expect(result).toEqual([{ leadMinutes: 5, content: 'Join here: ' }]);
  });

  it('returns an empty list for no reminders', () => {
    expect(resolveReminders([], ctx)).toEqual([]);
  });
});
