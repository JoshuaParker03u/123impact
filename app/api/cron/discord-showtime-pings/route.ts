import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveEventWindow, type EventDayHoursRow } from '@/lib/public-feed/resolve-event-window';
import { toInstant } from '@/lib/public-feed/to-instant';
import { resolveReminders, type ShowtimeReminderInput } from '@/lib/discord/showtime-config';
import { postShowtimeWebhook } from '@/lib/discord/showtime-webhook';

// Fires each configured Discord showtime reminder tier for any event/panel
// whose lead-time has just elapsed. Not registered in vercel.json -- its 4
// crons are all once-daily; this needs every-few-minutes firing, so (per
// CLAUDE.md) it's meant to be polled externally via Cron-job.org, same as
// app/api/cron/send-scheduled-emails/route.ts.
const GRACE_WINDOW_MS = 60 * 60 * 1000; // don't fire more than 1h after the target instant

type ReminderRow = ShowtimeReminderInput & { id: string; sent_at: string | null };

type EventRow = {
  id: string;
  date: string;
  time: string;
  end_date: string | null;
  discord_showtime_webhook_url: string | null;
  organizations: { timezone: string | null } | null;
};

// Panels are only queried with their own webhook set -- a panel with none
// gets no reminders at all (the implicit event-webhook cascade was
// deliberately dropped for simplicity).
type PanelRow = {
  id: string;
  event_id: string;
  panel_date: string | null;
  start_time: string;
  discord_showtime_webhook_url: string;
};

function groupBy<T>(rows: T[], key: keyof T): Record<string, T[]> {
  return rows.reduce((acc, row) => {
    const k = row[key] as string;
    (acc[k] ??= []).push(row);
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

async function fireDueReminders(
  service: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  table: 'events' | 'panels',
  ownerId: string,
  webhookUrl: string,
  reminders: ReminderRow[],
  start: Date | null,
  now: number,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  if (!start) return { sent, failed };

  const effectives = resolveReminders(reminders);
  for (let i = 0; i < reminders.length; i++) {
    const row = reminders[i];
    const effective = effectives[i];
    if (row.sent_at) continue;
    if (!isDue(start, effective.leadMinutes, now)) continue;

    const result = await postShowtimeWebhook(webhookUrl, effective.content);
    if (result.success) sent++;
    else {
      failed++;
      console.error(`showtime reminder (${table}) failed:`, ownerId, row.id, result.error);
    }
    await service
      .from('discord_showtime_reminders')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', row.id)
      .is('sent_at', null);
  }

  return { sent, failed };
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
      id, date, time, end_date, discord_showtime_webhook_url,
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
  let eventReminders: Record<string, ReminderRow[]> = {};
  let panelReminders: Record<string, ReminderRow[]> = {};

  if (eventIds.length) {
    const [{ data: dayHours }, { data: panels }, { data: evReminders }] = await Promise.all([
      service.from('event_day_hours').select('event_id, event_date, start_time, end_time').in('event_id', eventIds),
      service
        .from('panels')
        .select('id, event_id, panel_date, start_time, discord_showtime_webhook_url')
        .in('event_id', eventIds)
        .not('discord_showtime_webhook_url', 'is', null),
      service
        .from('discord_showtime_reminders')
        .select('id, event_id, lead_minutes, message, sent_at')
        .in('event_id', eventIds)
        .is('sent_at', null),
    ]);
    dayHoursByEvent = groupBy<EventDayHoursRow & { event_id: string }>(dayHours ?? [], 'event_id');
    panelsByEvent = groupBy<PanelRow>(panels ?? [], 'event_id');
    eventReminders = groupBy<ReminderRow & { event_id: string }>(evReminders ?? [], 'event_id');

    const panelIds = (panels ?? []).map((p: { id: string }) => p.id);
    if (panelIds.length) {
      const { data: pnReminders } = await service
        .from('discord_showtime_reminders')
        .select('id, panel_id, lead_minutes, message, sent_at')
        .in('panel_id', panelIds)
        .is('sent_at', null);
      panelReminders = groupBy<ReminderRow & { panel_id: string }>(pnReminders ?? [], 'panel_id');
    }
  }

  let sent = 0;
  let failed = 0;

  for (const event of eventRows) {
    const timezone = event.organizations?.timezone ?? null;

    if (event.discord_showtime_webhook_url) {
      const window = resolveEventWindow({
        date: event.date,
        time: event.time,
        end_date: event.end_date,
        timezone,
        dayHours: dayHoursByEvent[event.id] ?? [],
      });
      const result = await fireDueReminders(
        service, 'events', event.id, event.discord_showtime_webhook_url,
        eventReminders[event.id] ?? [], window?.start ?? null, now,
      );
      sent += result.sent;
      failed += result.failed;
    }

    for (const panel of panelsByEvent[event.id] ?? []) {
      const start = toInstant(panel.panel_date ?? event.date, panel.start_time, timezone);
      const result = await fireDueReminders(
        service, 'panels', panel.id, panel.discord_showtime_webhook_url,
        panelReminders[panel.id] ?? [], start, now,
      );
      sent += result.sent;
      failed += result.failed;
    }
  }

  return NextResponse.json({ sent, failed });
}
