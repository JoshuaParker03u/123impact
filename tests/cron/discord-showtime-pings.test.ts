// Route-level regression test for the Discord "showtime" ping cron. Proves
// the end-to-end fallback chain (event-level config, panel-level override)
// and the one-shot dedup guard (discord_showtime_ping_sent_at), not just the
// pure resolveShowtimeConfig helper already covered in
// tests/discord/showtime-config.test.ts.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as runCron } from '@/app/api/cron/discord-showtime-pings/route';
import {
  createTestOrg, createTestEvent, createTestPanel, cleanupEvent, cleanupOrg,
} from '../helpers/fixtures';
import { getServiceClient } from '../helpers/client';

const CRON_SECRET = 'vitest-cron-secret';

function callCron() {
  return runCron(new NextRequest('http://localhost/api/cron/discord-showtime-pings', {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  }));
}

// now + 15 minutes, floored to the minute -- guarantees the computed start
// instant is never later than the real "now + 15min", so the cron's
// isDue check (now >= start - leadMinutes) always holds without relying on
// exact-second timing.
function fifteenMinutesFromNow(): { date: string; time: string } {
  const target = new Date(Date.now() + 15 * 60_000);
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

  describe('event-level ping', () => {
    let eventId: string;
    const fetchMock = vi.fn<WebhookMock>(async () => new Response(null, { status: 204 }));

    beforeAll(async () => {
      ({ orgId } = await createTestOrg());
      const { date, time } = fifteenMinutesFromNow();
      ({ eventId } = await createTestEvent(orgId, {
        date, time,
        discord_showtime_webhook_url: 'https://discord.com/api/webhooks/1/event-level',
      }));
      vi.stubGlobal('fetch', webhookOnlyFetch(fetchMock));
    });

    afterAll(async () => {
      vi.unstubAllGlobals();
      await cleanupEvent(eventId);
      await cleanupOrg(orgId);
    });

    it('posts the default message to the configured webhook and marks the event as pinged', async () => {
      const res = await callCron();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sent).toBe(1);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://discord.com/api/webhooks/1/event-level');
      expect(JSON.parse(init!.body as string)).toEqual({ content: '@here Showtime in 15 minutes' });

      const { data } = await getServiceClient().from('events').select('discord_showtime_ping_sent_at').eq('id', eventId).single();
      expect(data?.discord_showtime_ping_sent_at).not.toBeNull();
    });

    it('does not re-send on a second run (dedup holds)', async () => {
      fetchMock.mockClear();
      const res = await callCron();
      const body = await res.json();
      expect(body.sent).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('panel-level override', () => {
    let eventId: string;
    let panelId: string;
    const fetchMock = vi.fn<WebhookMock>(async () => new Response(null, { status: 204 }));

    beforeAll(async () => {
      ({ orgId } = await createTestOrg());
      const { date, time } = fifteenMinutesFromNow();
      // Event has NO webhook of its own -- proves the panel can configure
      // showtime pings independently, not just override an existing one.
      // panel_date is left null (inherits the event's own date), matching
      // how a real single-day event's panel is actually configured -- only
      // multi-day events let a panel pick its own date in the admin UI.
      ({ eventId } = await createTestEvent(orgId, { panels_enabled: true, date }));
      ({ panelId } = await createTestPanel(eventId, {
        start_time: time,
        discord_showtime_webhook_url: 'https://discord.com/api/webhooks/2/panel-only',
        discord_showtime_message: 'Panel starting soon!',
      }));
      vi.stubGlobal('fetch', webhookOnlyFetch(fetchMock));
    });

    afterAll(async () => {
      vi.unstubAllGlobals();
      await cleanupEvent(eventId);
      await cleanupOrg(orgId);
    });

    it('fires the panel\'s own webhook/message and marks the panel as pinged, leaving the event alone', async () => {
      const res = await callCron();
      const body = await res.json();
      expect(body.sent).toBe(1);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://discord.com/api/webhooks/2/panel-only');
      expect(JSON.parse(init!.body as string)).toEqual({ content: 'Panel starting soon!' });

      const service = getServiceClient();
      const { data: panel } = await service.from('panels').select('discord_showtime_ping_sent_at').eq('id', panelId).single();
      expect(panel?.discord_showtime_ping_sent_at).not.toBeNull();

      const { data: event } = await service.from('events').select('discord_showtime_ping_sent_at').eq('id', eventId).single();
      expect(event?.discord_showtime_ping_sent_at).toBeNull();
    });
  });
});
