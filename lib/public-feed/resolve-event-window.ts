// Resolves an event's overall start/end instant for the public feed. Pulled
// out as a pure function after a real bug: a real staging org's multi-day
// events all had events.time = '' (not stale/bad data — components/admin/
// EventModal.jsx intentionally leaves it blank once per-day custom hours
// are set in event_day_hours instead), and the feed was treating that blank
// top-level time as unparseable and silently excluding every one of that
// org's events.
//
// Mirrors the precedence app/admin/events/[id]/page.tsx's own
// formatScheduleSummary already uses: day hours are authoritative whenever
// any exist for the event (even one row), events.date/time is only the
// fallback when there are none.
import { toInstant } from './to-instant';

export interface EventDayHoursRow {
  event_date: string;
  start_time: string;
  end_time: string;
}

export interface ResolveEventWindowInput {
  date: string;
  time: string;
  end_date: string | null;
  timezone: string | null;
  dayHours: EventDayHoursRow[];
}

export function resolveEventWindow(input: ResolveEventWindowInput): { start: Date; end: Date } | null {
  const { date, time, end_date, timezone, dayHours } = input;

  if (dayHours.length) {
    const sorted = [...dayHours].sort((a, b) => a.event_date.localeCompare(b.event_date));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const start = toInstant(first.event_date, first.start_time, timezone);
    const end = toInstant(last.event_date, last.end_time, timezone);
    if (start && end) return { start, end };
  }

  const start = toInstant(date, time, timezone);
  const end = toInstant(end_date ?? date, '23:59', timezone);
  return start && end ? { start, end } : null;
}
