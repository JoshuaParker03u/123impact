// Builds the message payload for event/panel "advertise on Discord" posts —
// an embed (shared look via baseEmbed) plus a Sign Up link button, rather
// than a plain-text blob. Structured fields keep every announcement in the
// same shape instead of each one being its own paragraph layout.

import { baseEmbed, linkButton, orgAuthor, MessagePayload, DiscordEmbedField } from './embed';

function formatTime(time: string | null | undefined): string {
  if (!time) return '';
  const match = time.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return time;
  const h = parseInt(match[1], 10);
  const m = match[2];
  const p = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${p}`;
}

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatDateRange(date: string, endDate: string | null): string {
  return endDate && endDate !== date ? `${formatDate(date)} – ${formatDate(endDate)}` : formatDate(date);
}

export function buildEventAnnouncement(
  event: { title: string; description: string | null; date: string; end_date: string | null; time: string; location: string },
  org: { name: string; logo_url?: string | null },
  signupUrl: string
): MessagePayload {
  const fields: DiscordEmbedField[] = [
    { name: 'When', value: [formatDateRange(event.date, event.end_date), formatTime(event.time)].filter(Boolean).join(' · '), inline: true },
  ];
  if (event.location) fields.push({ name: 'Where', value: event.location, inline: true });

  return {
    embeds: [baseEmbed({
      title: `📢 ${event.title}`,
      description: event.description || undefined,
      author: orgAuthor(org),
      fields,
    })],
    components: [linkButton('Sign Up', signupUrl)],
  };
}

export function buildPanelAnnouncement(
  panel: { name: string; description: string | null; panel_date: string | null; start_time: string; end_time: string; location: string | null; capacity: number; allow_waitlist: boolean; available: number },
  event: { title: string; date: string; end_date: string | null },
  org: { name: string; logo_url?: string | null },
  signupUrl: string,
  speakerNames: string[] = []
): MessagePayload {
  // The panel's own day when it's set (useful on a multi-day event to say
  // which day this specific panel falls on), else the event's date/range —
  // a panel should never post with no date at all just because panel_date
  // wasn't filled in.
  const dateStr = panel.panel_date ? formatDate(panel.panel_date) : formatDateRange(event.date, event.end_date);
  const timeStr = `${formatTime(panel.start_time)}–${formatTime(panel.end_time)}`;

  const fields: DiscordEmbedField[] = [
    { name: 'When', value: [dateStr, timeStr].filter(Boolean).join(' · '), inline: true },
  ];
  if (panel.location) fields.push({ name: 'Where', value: panel.location, inline: true });
  if (speakerNames.length > 0) {
    fields.push({ name: `Featured speaker${speakerNames.length > 1 ? 's' : ''}`, value: speakerNames.join(', ') });
  }
  fields.push({
    name: 'Availability',
    value: panel.available > 0
      ? `${panel.available} ${panel.available === 1 ? 'spot' : 'spots'} left`
      : panel.allow_waitlist ? 'Full — waitlist open' : 'Currently full',
  });

  return {
    embeds: [baseEmbed({
      title: `📢 ${panel.name}`,
      description: [panel.description, `_a panel at ${event.title}_`].filter(Boolean).join('\n\n'),
      author: orgAuthor(org),
      fields,
    })],
    components: [linkButton('Sign Up', signupUrl)],
  };
}
