// Resolves the effective Discord "showtime" ping settings for an event or
// panel. A panel's own fields override the parent event's field-by-field;
// null on the panel means "inherit." Presence of a webhook URL (event's or
// panel's) is itself the opt-in -- no separate enable/disable flag.
export interface ShowtimeConfigSource {
  discord_showtime_webhook_url: string | null;
  discord_showtime_message: string | null;
  discord_showtime_lead_minutes: number | null;
}

export interface EffectiveShowtimeConfig {
  webhookUrl: string;
  leadMinutes: number;
  content: string;
}

export function defaultShowtimeMessage(leadMinutes: number): string {
  return `@here Showtime in ${leadMinutes} minute${leadMinutes === 1 ? '' : 's'}`;
}

export function resolveShowtimeConfig(
  event: ShowtimeConfigSource,
  panel?: ShowtimeConfigSource | null
): EffectiveShowtimeConfig | null {
  const webhookUrl = panel?.discord_showtime_webhook_url ?? event.discord_showtime_webhook_url;
  if (!webhookUrl) return null;

  const leadMinutes = panel?.discord_showtime_lead_minutes ?? event.discord_showtime_lead_minutes ?? 15;
  const message = panel?.discord_showtime_message ?? event.discord_showtime_message ?? null;

  return { webhookUrl, leadMinutes, content: message ?? defaultShowtimeMessage(leadMinutes) };
}
