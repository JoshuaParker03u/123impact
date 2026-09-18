// Builds the message text for event/panel "advertise on Discord" posts.
// Plain markdown, not embeds — Discord auto-unfurls the signup link into a
// rich preview using the signup page's opengraph-image, so a hand-built
// embed would just be a redundant second card under the message.

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

export function buildEventAnnouncement(
  event: { title: string; description: string | null; date: string; end_date: string | null; time: string; location: string },
  signupUrl: string
): string {
  const dateStr = event.end_date && event.end_date !== event.date
    ? `${formatDate(event.date)} – ${formatDate(event.end_date)}`
    : formatDate(event.date);

  const lines = [
    `📢 **${event.title}**`,
    [dateStr, formatTime(event.time), event.location].filter(Boolean).join(' · '),
  ];
  if (event.description) lines.push(event.description);
  lines.push(`Sign up: ${signupUrl}`);
  return lines.join('\n\n');
}

export function buildPanelAnnouncement(
  panel: { name: string; description: string | null; panel_date: string | null; start_time: string; end_time: string; location: string | null; capacity: number; allow_waitlist: boolean; available: number },
  eventTitle: string,
  signupUrl: string,
  speakerNames: string[] = []
): string {
  const dateStr = panel.panel_date ? formatDate(panel.panel_date) : null;
  const timeStr = `${formatTime(panel.start_time)}–${formatTime(panel.end_time)}`;

  const lines = [
    `📢 **${panel.name}** — a panel at ${eventTitle}`,
    [dateStr, timeStr, panel.location].filter(Boolean).join(' · '),
  ];
  if (panel.description) lines.push(panel.description);
  if (speakerNames.length > 0) lines.push(`🎤 Featured speaker${speakerNames.length > 1 ? 's' : ''}: ${speakerNames.join(', ')}`);
  lines.push(
    panel.available > 0
      ? `${panel.available} ${panel.available === 1 ? 'spot' : 'spots'} left`
      : panel.allow_waitlist ? 'Full — waitlist open' : 'Currently full'
  );
  lines.push(`Sign up: ${signupUrl}`);
  return lines.join('\n\n');
}
