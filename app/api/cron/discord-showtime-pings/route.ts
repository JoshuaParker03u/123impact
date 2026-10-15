import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveEventWindow, type EventDayHoursRow } from '@/lib/public-feed/resolve-event-window';
import { toInstant } from '@/lib/public-feed/to-instant';
import { resolveShowtimeConfig, type ShowtimeConfigSource } from '@/lib/discord/showtime-config';
import { postShowtimeWebhook } from '@/lib/discord/showtime-webhook';

// Fires a Discord showtime ping for any event/panel whose configured
// lead-time has just elapsed. Not registered in vercel.json -- its 4 crons
// are all once-daily; this needs every-few-minutes firing, so (per
// CLAUDE.md) it's meant to be polled externally via Cron-job.org, same as
// app/api/cron/send-scheduled-emails/route.ts.
const GRACE_WINDOW_MS = 60 * 60 * 1000; // don't fire more than 1h after the target instant

type EventRow = ShowtimeConfigSource & {
  id: string;
  date: string;
  time: string;
  end_date: string | null;
  discord_showtime_ping_sent_at: string | null;
  organizations: { timezone: string | null } | null;
};

type PanelRow = ShowtimeConfigSource & {
  id: string;
  event_id: string;
  discord_showtime_ping_sent_at: string | null;
  panel_date: string | null;
  start_time: string;
};

function groupByEventId<T extends { event_id: string }>(rows: T[]): Record<string, T[]> {
  return rows.reduce((acc, row) => {
    (acc[row.event_id] ??= []).push(row);
    return acc;
  }, {} as Record<string, T[]>);
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isDue(start: Date, leadMinutes: number, now: number): boolean {
  const target = start.getTime() - leadMinutes * 60_000;
  const diff = now - target;
  return diff >= 0 && diff <= GRACE_WINDOW_MS;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const now = Date.now();
  const lookback = toDateStr(new Date(now - 24 * 60 * 60 * 1000));
  const lookahead = toDateStr(new Date(now + 2 * 24 * 60 * 60 * 1000));

  const { data: events } = await service
    .from('events')
    .select(`
      id, date, time, end_date,
      discord_showtime_webhook_url, discord_showtime_message, discord_showtime_lead_minutes, discord_showtime_ping_sent_at,
      organizations!inner(timezone)
    `)
    .not('status', 'in', '(cancelled,deleted)')
    .lte('date', lookahead)
    // A multi-day event can have started well before `lookback` and still
    // have upcoming panels -- bound on whichever of end_date/date is later,
    // not just the event's own start date.
    .or(`end_date.gte.${lookback},and(end_date.is.null,date.gte.${lookback})`);

  const eventRows = (events ?? []) as unknown as EventRow[];
  const eventIds = eventRows.map((e) => e.id);

  let dayHoursByEvent: Record<string, EventDayHoursRow[]> = {};
  let panelsByEvent: Record<string, PanelRow[]> = {};

  if (eventIds.length) {
    const [{ data: dayHours }, { data: panels }] = await Promise.all([
      service.from('event_day_hours').select('event_id, event_date, start_time, end_time').in('event_id', eventIds),
      service
        .from('panels')
        .select('id, event_id, panel_date, start_time, discord_showtime_webhook_url, discord_showtime_message, discord_showtime_lead_minutes, discord_showtime_ping_sent_at')
        .in('event_id', eventIds),
    ]);
    dayHoursByEvent = groupByEventId((dayHours ?? []) as (EventDayHoursRow & { event_id: string })[]);
    panelsByEvent = groupByEventId((panels ?? []) as PanelRow[]);
  }

  let sent = 0;
  let failed = 0;

  for (const event of eventRows) {
    const timezone = event.organizations?.timezone ?? null;

    if (!event.discord_showtime_ping_sent_at) {
      const cfg = resolveShowtimeConfig(event, null);
      if (cfg) {
        const window = resolveEventWindow({
          date: event.date,
          time: event.time,
          end_date: event.end_date,
          timezone,
          dayHours: dayHoursByEvent[event.id] ?? [],
        });
        if (window && isDue(window.start, cfg.leadMinutes, now)) {
          const result = await postShowtimeWebhook(cfg.webhookUrl, cfg.content);
          if (result.success) sent++;
          else {
            failed++;
            console.error('showtime ping (event) failed:', event.id, result.error);
          }
          await service
            .from('events')
            .update({ discord_showtime_ping_sent_at: new Date().toISOString() })
            .eq('id', event.id)
            .is('discord_showtime_ping_sent_at', null);
        }
      }
    }

    for (const panel of panelsByEvent[event.id] ?? []) {
      if (panel.discord_showtime_ping_sent_at) continue;
      const cfg = resolveShowtimeConfig(event, panel);
      if (!cfg) continue;

      const start = toInstant(panel.panel_date ?? event.date, panel.start_time, timezone);
      if (start && isDue(start, cfg.leadMinutes, now)) {
        const result = await postShowtimeWebhook(cfg.webhookUrl, cfg.content);
        if (result.success) sent++;
        else {
          failed++;
          console.error('showtime ping (panel) failed:', panel.id, result.error);
        }
        await service
          .from('panels')
          .update({ discord_showtime_ping_sent_at: new Date().toISOString() })
          .eq('id', panel.id)
          .is('discord_showtime_ping_sent_at', null);
      }
    }
  }

  return NextResponse.json({ sent, failed });
}
