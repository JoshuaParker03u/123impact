import { describe, it, expect } from 'vitest';
import { resolveReminders, defaultShowtimeMessage } from '@/lib/discord/showtime-config';

describe('defaultShowtimeMessage', () => {
  it('uses a distinct "now beginning" message at 0 minutes, with no @here', () => {
    expect(defaultShowtimeMessage(0, 'Game Night')).toBe('Game Night is now beginning!');
  });

  it('pluralizes correctly at 1 minute vs more, with @here and the name', () => {
    expect(defaultShowtimeMessage(1, 'Game Night')).toBe('@here Game Night starts in 1 minute!');
    expect(defaultShowtimeMessage(30, 'Game Night')).toBe('@here Game Night starts in 30 minutes!');
  });
});

describe('resolveReminders', () => {
  it('resolves each reminder independently, defaulting content (with the name) when no custom message is set', () => {
    const result = resolveReminders([
      { lead_minutes: 60, message: null },
      { lead_minutes: 30, message: 'Halfway there!' },
      { lead_minutes: 0, message: null },
    ], 'Game Night');
    expect(result).toEqual([
      { leadMinutes: 60, content: '@here Game Night starts in 60 minutes!' },
      { leadMinutes: 30, content: 'Halfway there!' },
      { leadMinutes: 0, content: 'Game Night is now beginning!' },
    ]);
  });

  it('returns an empty list for no reminders', () => {
    expect(resolveReminders([], 'Game Night')).toEqual([]);
  });
});
