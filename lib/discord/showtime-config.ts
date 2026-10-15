// Resolves the effective content for each of an event/panel's configured
// Discord "showtime" reminder tiers. Ownership (which webhook a reminder
// posts to) is decided entirely by presence of events.discord_showtime_webhook_url
// / panels.discord_showtime_webhook_url -- there is no field-by-field
// inheritance between event and panel anymore; a panel with no webhook of
// its own simply has no reminders of its own either.
import { toZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';

export interface ShowtimeReminderInput {
  lead_minutes: number;
  message: string | null;
}

export interface EffectiveReminder {
  leadMinutes: number;
  content: string;
}

// Shared across every reminder tier for one event/panel -- lead_minutes is
// the one substitutable that varies per reminder, so it's applied alongside
// this context rather than being part of it.
export interface ShowtimeMessageContext {
  name: string; // the event's title or the panel's name
  time: string; // pre-formatted local start time, e.g. "7:00 PM"
  link: string | null; // the event's/panel's own online_url, if set
}

export function formatShowtimeClock(instant: Date, timezone: string | null): string {
  return format(toZonedTime(instant, timezone ?? 'UTC'), 'h:mm a');
}

export function defaultShowtimeMessage(leadMinutes: number, name: string): string {
  if (leadMinutes === 0) return `@here ${name} is now beginning!`;
  return `@here ${name} starts in ${leadMinutes} minute${leadMinutes === 1 ? '' : 's'}!`;
}

// Custom messages can reference <name>, <minutes>, <time>, and <link>
// (case-insensitive) -- substituted literally, verbatim text otherwise.
function applySubstitutions(message: string, leadMinutes: number, ctx: ShowtimeMessageContext): string {
  return message
    .replace(/<name>/gi, ctx.name)
    .replace(/<minutes>/gi, String(leadMinutes))
    .replace(/<time>/gi, ctx.time)
    .replace(/<link>/gi, ctx.link ?? '');
}

export function resolveReminders(reminders: ShowtimeReminderInput[], ctx: ShowtimeMessageContext): EffectiveReminder[] {
  return reminders.map((r) => ({
    leadMinutes: r.lead_minutes,
    content: r.message != null
      ? applySubstitutions(r.message, r.lead_minutes, ctx)
      : defaultShowtimeMessage(r.lead_minutes, ctx.name),
  }));
}
