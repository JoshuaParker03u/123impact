// Inverse of lib/public-feed/to-instant.ts's toInstant(): takes a wall-clock
// date+time as understood in one IANA timezone and re-expresses it as the
// wall-clock date+time in a different IANA timezone. Used so an admin can
// type a time in their own personal timezone (user_metadata.timezone) while
// the DB keeps storing org-timezone wall-clock strings
// (organizations.timezone) -- the same convention to-instant.ts already
// assumes on the read side (the public feed, the Discord showtime cron).
//
// Composes with toInstant() rather than duplicating its HH:MM[:SS] parsing
// or its null-timezone-means-UTC convention, so both directions agree on
// what "unparseable" means.
import { toZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';
import { toInstant } from '@/lib/public-feed/to-instant';

export interface WallClock {
  date: string; // 'yyyy-MM-dd'
  time: string; // 'HH:mm'
}

export function convertWallClock(
  date: string,
  time: string,
  fromTz: string | null,
  toTz: string | null,
): WallClock | null {
  const instant = toInstant(date, time, fromTz);
  if (!instant) return null;

  const zoned = toZonedTime(instant, toTz ?? 'UTC');
  return { date: format(zoned, 'yyyy-MM-dd'), time: format(zoned, 'HH:mm') };
}

// Short display label for a timezone (e.g. "PDT", "UTC") -- used to mark
// times that are shown in the org's own timezone rather than the viewing
// admin's personal one, so the two don't look like they silently disagree.
// Computed via Intl rather than a hardcoded map so it reflects DST correctly
// for any IANA zone without the app needing to track transition dates itself.
export function timezoneAbbreviation(timezone: string | null, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone ?? 'UTC', timeZoneName: 'short' }).formatToParts(at);
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? (timezone ?? 'UTC');
  } catch {
    return timezone ?? 'UTC';
  }
}

export function diffInDays(a: string, b: string): number {
  return Math.round((new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface DayHoursEntry {
  start_time: string;
  end_time: string;
}

export interface DayHoursRow {
  event_date: string;
  start_time: string;
  end_time: string;
}

export interface BuildDayHoursRowsResult {
  rows: DayHoursRow[] | null;
  error: string | null;
}

// Converts an EventModal day-hours map (keyed by the calendar date the admin
// sees, in their own personal timezone) into org-timezone rows ready to
// upsert into event_day_hours. A day's start time is what decides its target
// date (anchor-by-start) -- its end time converts the same direction but is
// pinned to that same target date, since one DB row can't represent two
// different display dates. Refuses (rather than silently overwriting) if
// two different displayed days would land on the same target date.
export function buildDayHoursRows(
  dayHours: Record<string, DayHoursEntry | undefined>,
  days: string[],
  personalTz: string | null,
  orgTz: string | null,
): BuildDayHoursRowsResult {
  const rows: DayHoursRow[] = [];
  const targetToSource = new Map<string, string>();

  for (const day of days) {
    const entry = dayHours[day];
    if (!entry?.start_time || !entry?.end_time) continue;

    const startConv = convertWallClock(day, entry.start_time, personalTz, orgTz);
    const endConv = convertWallClock(day, entry.end_time, personalTz, orgTz);
    const targetDate = startConv?.date ?? day;

    const collidingSource = targetToSource.get(targetDate);
    if (collidingSource) {
      return {
        rows: null,
        error: `${collidingSource} and ${day} both convert to ${targetDate} in the organization's timezone — adjust one before saving.`,
      };
    }
    targetToSource.set(targetDate, day);

    rows.push({
      event_date: targetDate,
      start_time: startConv?.time ?? entry.start_time,
      end_time: endConv?.time ?? entry.end_time,
    });
  }

  return { rows, error: null };
}
