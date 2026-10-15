import { describe, it, expect } from 'vitest';
import { resolveReminders, defaultShowtimeMessage } from '@/lib/discord/showtime-config';

describe('defaultShowtimeMessage', () => {
  it('uses a distinct "starting now" message at 0 minutes', () => {
    expect(defaultShowtimeMessage(0)).toBe('@here Showtime is starting now!');
  });

  it('pluralizes correctly at 1 minute vs more', () => {
    expect(defaultShowtimeMessage(1)).toBe('@here Showtime in 1 minute');
    expect(defaultShowtimeMessage(30)).toBe('@here Showtime in 30 minutes');
  });
});

describe('resolveReminders', () => {
  it('resolves each reminder independently, defaulting content when no custom message is set', () => {
    const result = resolveReminders([
      { lead_minutes: 60, message: null },
      { lead_minutes: 30, message: 'Halfway there!' },
      { lead_minutes: 0, message: null },
    ]);
    expect(result).toEqual([
      { leadMinutes: 60, content: '@here Showtime in 60 minutes' },
      { leadMinutes: 30, content: 'Halfway there!' },
      { leadMinutes: 0, content: '@here Showtime is starting now!' },
    ]);
  });

  it('returns an empty list for no reminders', () => {
    expect(resolveReminders([])).toEqual([]);
  });
});
