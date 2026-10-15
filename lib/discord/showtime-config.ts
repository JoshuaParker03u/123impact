// Resolves the effective content for each of an event/panel's configured
// Discord "showtime" reminder tiers. Ownership (which webhook a reminder
// posts to) is decided entirely by presence of events.discord_showtime_webhook_url
// / panels.discord_showtime_webhook_url -- there is no field-by-field
// inheritance between event and panel anymore; a panel with no webhook of
// its own simply has no reminders of its own either.
export interface ShowtimeReminderInput {
  lead_minutes: number;
  message: string | null;
}

export interface EffectiveReminder {
  leadMinutes: number;
  content: string;
}

export function defaultShowtimeMessage(leadMinutes: number): string {
  if (leadMinutes === 0) return '@here Showtime is starting now!';
  return `@here Showtime in ${leadMinutes} minute${leadMinutes === 1 ? '' : 's'}`;
}

export function resolveReminders(reminders: ShowtimeReminderInput[]): EffectiveReminder[] {
  return reminders.map((r) => ({
    leadMinutes: r.lead_minutes,
    content: r.message ?? defaultShowtimeMessage(r.lead_minutes),
  }));
}
