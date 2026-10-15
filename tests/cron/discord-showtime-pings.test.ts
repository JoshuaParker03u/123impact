// Route-level regression test for the Discord "showtime" ping cron, now
// covering MULTIPLE independent reminder tiers per event/panel (e.g. a
// 1hr/30min/starting-now set), not just the single-lead-time version this
// replaced. Proves: several reminders on the same owner fire and dedupe
// independently (one sent_at per reminder row, not per event/panel), a
// panel with no webhook of its own gets nothing (the old event-webhook
// cascade was deliberately dropped), and the lead_minutes=0 "starting now"
// tier uses its own distinct default message.
//
// Lead times used here are small (minutes, not the real 60/30/0 example)
// so the test can position "now" relative to a single shared event start
// time without the 1-hour grace window making several widely-spaced lead
// times simultaneously due only at one razor-thin instant -- the mechanism
// being tested (independent per-row due-checking and dedup) doesn't care
// what the actual lead values are.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as runCron } from '@/app/api/cron/discord-showtime-pings/route';
import { formatShowtimeClock } from '@/lib/discord/showtime-config';
import {
  createTestOrg, createTestEvent, createTestPanel, createShowtimeReminder, cleanupEvent, cleanupOrg,
} from '../helpers/fixtures';
import { getServiceClient } from '../helpers/client';

const CRON_SECRET = 'vitest-cron-secret';

function callCron() {
  return runCron(new NextRequest('http://localhost/api/cron/discord-showtime-pings', {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  }));
}

// "minutesFromNow" floored to the minute -- guarantees the computed start
// instant is never later than the real target, so the cron's isDue check
// (now >= start - leadMinutes) always holds without relying on exact-second
// timing. Mirrors the pattern used throughout this file's predecessor.
function atMinutesFromNow(minutes: number): { date: string; time: string } {
  const target = new Date(Date.now() + minutes * 60_000);
  return { date: target.toISOString().slice(0, 10), time: target.toISOString().slice(11, 16) };
}

// The route's own Supabase service client uses global fetch too, so a mock
// that intercepts every call (rather than just the webhook URL) breaks every
// DB query the cron makes. Only the discord.com/api/webhooks/... POSTs get
// faked; everything else (the Supabase REST calls) passes through to the
// real fetch.
type WebhookMock = (url: string, init?: RequestInit) => Promise<Response>;

const realFetch = globalThis.fetch;
function webhookOnlyFetch(mock: WebhookMock) {
  return (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith('https://discord.com/api/webhooks/')) {
      return mock(url, init);
    }
    return realFetch(input, init);
  };
}

describe('GET /api/cron/discord-showtime-pings', () => {
  const originalSecret = process.env.CRON_SECRET;
  let orgId: string;

  beforeAll(() => {
    process.env.CRON_SECRET = CRON_SECRET;
  });

  afterAll(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it('rejects a request without the correct bearer token', async () => {
    const res = await runCron(new NextRequest('http://localhost/api/cron/discord-showtime-pings'));
    expect(res.status).toBe(401);
  });

  describe('multiple reminder tiers on one event', () => {
    let eventId: string;
    const fetchMock = vi.fn<WebhookMock>(async () => new Response(null, { status: 204 }));

    beforeAll(async () => {
      ({ orgId } = await createTestOrg());
      // Showtime is 10 minutes out: the 10-min-lead reminder's target is
      // "now" (due); the 5-min and 0-min reminders' targets are still in
      // the future (not yet due).
      const { date, time } = atMinutesFromNow(10);
      ({ eventId } = await createTestEvent(orgId, {
        date, time, title: 'Game Night',
        discord_showtime_webhook_url: 'https://discord.com/api/webhooks/1/multi',
      }));
      await createShowtimeReminder({ eventId, leadMinutes: 10 });
      await createShowtimeReminder({ eventId, leadMinutes: 5, message: 'Halfway!' });
      await createShowtimeReminder({ eventId, leadMinutes: 0 });
      vi.stubGlobal('fetch', webhookOnlyFetch(fetchMock));
    });

    afterAll(async () => {
      vi.unstubAllGlobals();
      await cleanupEvent(eventId);
      await cleanupOrg(orgId);
    });

    it('fires only the reminder that is actually due, leaving the others pending', async () => {
      const res = await callCron();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sent).toBe(1);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://discord.com/api/webhooks/1/multi');
      expect(JSON.parse(init!.body as string)).toEqual({ content: '@here Game Night starts in 10 minutes!' });

      const { data: reminders } = await getServiceClient()
        .from('discord_showtime_reminders')
        .select('lead_minutes, sent_at')
        .eq('event_id', eventId)
        .order('lead_minutes', { ascending: false });
      expect(reminders).toEqual([
        { lead_minutes: 10, sent_at: expect.any(String) },
        { lead_minutes: 5, sent_at: null },
        { lead_minutes: 0, sent_at: null },
      ]);
    });

    it('does not re-send the already-fired reminder on a second run (dedup is per-row)', async () => {
      fetchMock.mockClear();
      const res = await callCron();
      const body = await res.json();
      expect(body.sent).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('lead_minutes = 0 ("starting now")', () => {
    let eventId: string;
    const fetchMock = vi.fn<WebhookMock>(async () => new Response(null, { status: 204 }));

    beforeAll(async () => {
      ({ orgId } = await createTestOrg());
      const { date, time } = atMinutesFromNow(0);
      ({ eventId } = await createTestEvent(orgId, {
        date, time, title: 'Game Night',
        discord_showtime_webhook_url: 'https://discord.com/api/webhooks/1/starting-now',
      }));
      await createShowtimeReminder({ eventId, leadMinutes: 0 });
      vi.stubGlobal('fetch', webhookOnlyFetch(fetchMock));
    });

    afterAll(async () => {
      vi.unstubAllGlobals();
      await cleanupEvent(eventId);
      await cleanupOrg(orgId);
    });

    it('fires with the distinct "now beginning" default message, including the event name', async () => {
      const res = await callCron();
      const body = await res.json();
      expect(body.sent).toBe(1);
      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(init!.body as string)).toEqual({ content: '@here Game Night is now beginning!' });
    });
  });

  describe('custom message with <name>/<minutes>/<time>/<link> substitutions', () => {
    let eventId: string;
    let expectedTime: string;
    const fetchMock = vi.fn<WebhookMock>(async () => new Response(null, { status: 204 }));

    beforeAll(async () => {
      ({ orgId } = await createTestOrg());
      const { date, time } = atMinutesFromNow(15);
      expectedTime = formatShowtimeClock(new Date(`${date}T${time}:00.000Z`), null);
      ({ eventId } = await createTestEvent(orgId, {
        date, time, title: 'Game Night',
        online_url: 'https://zoom.us/j/999',
        discord_showtime_webhook_url: 'https://discord.com/api/webhooks/1/substitutions',
      }));
      await createShowtimeReminder({
        eventId, leadMinutes: 15,
        message: '<name> starts at <time> (<minutes> min) -- join: <link>',
      });
      vi.stubGlobal('fetch', webhookOnlyFetch(fetchMock));
    });

    afterAll(async () => {
      vi.unstubAllGlobals();
      await cleanupEvent(eventId);
      await cleanupOrg(orgId);
    });

    it('substitutes every token using the event\'s own title, lead time, start time, and online_url', async () => {
      const res = await callCron();
      const body = await res.json();
      expect(body.sent).toBe(1);
      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(init!.body as string)).toEqual({
        content: `Game Night starts at ${expectedTime} (15 min) -- join: https://zoom.us/j/999`,
      });
    });
  });

  describe('panel with its own webhook', () => {
    let eventId: string;
    let panelId: string;
    const fetchMock = vi.fn<WebhookMock>(async () => new Response(null, { status: 204 }));

    beforeAll(async () => {
      ({ orgId } = await createTestOrg());
      // Panel's panel_date is left unset, so it falls back to the event's
      // own date -- both must agree on the same target date+time pair.
      const { date, time } = atMinutesFromNow(10);
      // Event has NO webhook of its own.
      ({ eventId } = await createTestEvent(orgId, { panels_enabled: true, date }));
      ({ panelId } = await createTestPanel(eventId, {
        start_time: time,
        discord_showtime_webhook_url: 'https://discord.com/api/webhooks/2/panel-only',
      }));
      await createShowtimeReminder({ panelId, leadMinutes: 10, message: 'Panel starting soon!' });
      vi.stubGlobal('fetch', webhookOnlyFetch(fetchMock));
    });

    afterAll(async () => {
      vi.unstubAllGlobals();
      await cleanupEvent(eventId);
      await cleanupOrg(orgId);
    });

    it('fires the panel\'s own reminder independently of the event', async () => {
      const res = await callCron();
      const body = await res.json();
      expect(body.sent).toBe(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://discord.com/api/webhooks/2/panel-only');
      expect(JSON.parse(init!.body as string)).toEqual({ content: 'Panel starting soon!' });

      const { data: reminder } = await getServiceClient()
        .from('discord_showtime_reminders')
        .select('sent_at')
        .eq('panel_id', panelId)
        .single();
      expect(reminder?.sent_at).not.toBeNull();
    });
  });

  describe('panel with no webhook of its own', () => {
    let eventId: string;
    let panelId: string;
    const fetchMock = vi.fn<WebhookMock>(async () => new Response(null, { status: 204 }));

    beforeAll(async () => {
      ({ orgId } = await createTestOrg());
      const { date, time } = atMinutesFromNow(0);
      // Event HAS a webhook+reminder -- proves it does not cascade down to
      // a panel that never configured its own (the old implicit-ping
      // behavior was deliberately removed).
      ({ eventId } = await createTestEvent(orgId, {
        panels_enabled: true, date, time,
        discord_showtime_webhook_url: 'https://discord.com/api/webhooks/1/event-only',
      }));
      await createShowtimeReminder({ eventId, leadMinutes: 0 });
      ({ panelId } = await createTestPanel(eventId, { start_time: time }));
      vi.stubGlobal('fetch', webhookOnlyFetch(fetchMock));
    });

    afterAll(async () => {
      vi.unstubAllGlobals();
      await cleanupEvent(eventId);
      await cleanupOrg(orgId);
    });

    it('only the event fires -- the unconfigured panel gets nothing', async () => {
      const res = await callCron();
      const body = await res.json();
      expect(body.sent).toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('https://discord.com/api/webhooks/1/event-only');

      const { count } = await getServiceClient()
        .from('discord_showtime_reminders')
        .select('id', { count: 'exact', head: true })
        .eq('panel_id', panelId);
      expect(count).toBe(0);
    });
  });
});
