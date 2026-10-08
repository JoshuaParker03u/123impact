// Hand-rolled iCal (RFC 5545) generation — no ical/rrule dependency exists in
// this project and the VEVENT field set needed here is narrow enough not to
// warrant adding one. One VEVENT per session (panel), per the spec. Emits
// UTC-only (Z-suffixed) timestamps for v1 — a per-org VTIMEZONE block with
// correct DST rules is a well-known source of subtle hand-rolled-iCal bugs,
// and every instant here is already a precise UTC Date from build-feed-data.
import type { OrgFeedData } from './types';

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
    for (const session of event.sessions) {
      const status = event.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED';
      const location = session.location ?? event.location;
      lines.push(
        'BEGIN:VEVENT',
        `UID:${session.id}@${appDomain}`,
        `DTSTAMP:${now}`,
        `DTSTART:${formatUtc(session.starts)}`,
        `DTEND:${formatUtc(session.ends)}`,
        `SUMMARY:${escapeText(session.title)}`,
        `STATUS:${status}`,
      );
      if (session.description) lines.push(`DESCRIPTION:${escapeText(session.description)}`);
      if (location) lines.push(`LOCATION:${escapeText(location)}`);
      lines.push(`URL:${event.apply_url}`);
      lines.push('END:VEVENT');
    }
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
