import { describe, it, expect } from 'vitest';
import { resolveShowtimeConfig, defaultShowtimeMessage } from '@/lib/discord/showtime-config';

const noShowtime = { discord_showtime_webhook_url: null, discord_showtime_message: null, discord_showtime_lead_minutes: null };

describe('resolveShowtimeConfig', () => {
  it('uses the event\'s own settings when there is no panel', () => {
    const event = { discord_showtime_webhook_url: 'https://discord.com/api/webhooks/1/abc', discord_showtime_message: null, discord_showtime_lead_minutes: 20 };
    const cfg = resolveShowtimeConfig(event, null);
    expect(cfg).toEqual({ webhookUrl: 'https://discord.com/api/webhooks/1/abc', leadMinutes: 20, content: '@here Showtime in 20 minutes' });
  });

  it('a panel fully overrides the event\'s webhook, message, and lead time', () => {
    const event = { discord_showtime_webhook_url: 'https://discord.com/api/webhooks/1/event', discord_showtime_message: 'Event message', discord_showtime_lead_minutes: 30 };
    const panel = { discord_showtime_webhook_url: 'https://discord.com/api/webhooks/2/panel', discord_showtime_message: 'Panel message', discord_showtime_lead_minutes: 5 };
    const cfg = resolveShowtimeConfig(event, panel);
    expect(cfg).toEqual({ webhookUrl: 'https://discord.com/api/webhooks/2/panel', leadMinutes: 5, content: 'Panel message' });
  });

  it('a panel with only some fields set falls back to the event per-field, not all-or-nothing', () => {
    const event = { discord_showtime_webhook_url: 'https://discord.com/api/webhooks/1/event', discord_showtime_message: 'Event message', discord_showtime_lead_minutes: 30 };
    const panel = { discord_showtime_webhook_url: null, discord_showtime_message: null, discord_showtime_lead_minutes: 5 };
    const cfg = resolveShowtimeConfig(event, panel);
    // webhook/message inherited from the event, lead minutes overridden by the panel.
    expect(cfg).toEqual({ webhookUrl: 'https://discord.com/api/webhooks/1/event', leadMinutes: 5, content: 'Event message' });
  });

  it('returns null when neither the event nor the panel has a webhook set -- no ping fires', () => {
    expect(resolveShowtimeConfig(noShowtime, null)).toBeNull();
    expect(resolveShowtimeConfig(noShowtime, noShowtime)).toBeNull();
  });

  it('a panel webhook with no event webhook still resolves (panel-only configuration)', () => {
    const panel = { discord_showtime_webhook_url: 'https://discord.com/api/webhooks/3/panel-only', discord_showtime_message: null, discord_showtime_lead_minutes: null };
    const cfg = resolveShowtimeConfig(noShowtime, panel);
    expect(cfg).toEqual({ webhookUrl: 'https://discord.com/api/webhooks/3/panel-only', leadMinutes: 15, content: '@here Showtime in 15 minutes' });
  });

  it('defaultShowtimeMessage pluralizes correctly at 1 minute', () => {
    expect(defaultShowtimeMessage(1)).toBe('@here Showtime in 1 minute');
    expect(defaultShowtimeMessage(15)).toBe('@here Showtime in 15 minutes');
  });

  it('a custom message is used verbatim, with no minute substitution', () => {
    const event = { discord_showtime_webhook_url: 'https://discord.com/api/webhooks/1/event', discord_showtime_message: 'We go live soon!', discord_showtime_lead_minutes: 10 };
    const cfg = resolveShowtimeConfig(event, null);
    expect(cfg?.content).toBe('We go live soon!');
  });
});
