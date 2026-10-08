// events.date/time (and panels.panel_date/start_time/end_time) are stored as
// plain wall-clock values in the org's own timezone, not UTC — convert using
// the org's declared timezone (falling back to UTC when unset) rather than
// letting the JS Date constructor guess from the server process's own TZ.
//
// time isn't guaranteed to be a clean "HH:MM" — this app's own admin code
// (formatEventTime in app/admin/events/[id]/page.tsx) already has to guard
// against that for the same columns, likely from platform-synced events.
// Parse leniently (1-2 digit hour, optional seconds) and return null rather
// than an Invalid Date on anything else, so the caller can skip just that
// one event/session instead of the whole feed request blowing up.
import { fromZonedTime } from 'date-fns-tz';

const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

export function toInstant(dateStr: string, timeStr: string, timeZone: string | null): Date | null {
  const match = TIME_RE.exec(timeStr);
  if (!match) return null;
  const [, h, m, s] = match;
  const instant = fromZonedTime(`${dateStr}T${h.padStart(2, '0')}:${m}:${s ?? '00'}`, timeZone ?? 'UTC');
  return Number.isNaN(instant.getTime()) ? null : instant;
}
