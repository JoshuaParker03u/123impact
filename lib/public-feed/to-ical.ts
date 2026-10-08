// Hand-rolled iCal (RFC 5545) generation — no ical/rrule dependency exists in
// this project and the VEVENT field set needed here is narrow enough not to
// warrant adding one. One VEVENT per session (panel), per the spec — except
// most orgs on this platform never use the Panels feature at all (plain
// shift-based volunteer events), so an event with zero sessions instead gets
// one VEVENT for itself; otherwise its .ics feed would be permanently empty,
// which defeats "subscribe in a calendar app" for the common case. Emits
// UTC-only (Z-suffixed) timestamps for v1 — a per-org VTIMEZONE block with
// correct DST rules is a well-known source of subtle hand-rolled-iCal bugs,
// and every instant here is already a precise UTC Date from build-feed-data.
import type { OrgFeedData } from './types';

function pushEvent(lines: string[], uid: string, now: string, start: Date, end: Date, title: string, status: string, description: string | null, location: string | null, url: string) {
  lines.push(
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${formatUtc(start)}`,
    `DTEND:${formatUtc(end)}`,
    `SUMMARY:${escapeText(title)}`,
    `STATUS:${status}`,
  );
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (location) lines.push(`LOCATION:${escapeText(location)}`);
  lines.push(`URL:${url}`, 'END:VEVENT');
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function formatUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function buildIcal(data: OrgFeedData, appDomain: string): string {
  const now = formatUtc(new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//123impact//Public Events Feed//EN',
    'CALSCALE:GREGORIAN',
  ];

  for (const event of data.events) {
    const status = event.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED';

    if (event.sessions.length === 0) {
      pushEvent(lines, `${event.id}@${appDomain}`, now, event.starts, event.ends, event.title, status, event.description, event.location, event.apply_url);
      continue;
    }

    for (const session of event.sessions) {
      const location = session.location ?? event.location;
      pushEvent(lines, `${session.id}@${appDomain}`, now, session.starts, session.ends, session.title, status, session.description, location, event.apply_url);
    }
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
