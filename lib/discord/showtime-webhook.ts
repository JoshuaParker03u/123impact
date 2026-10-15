// Posts to a Discord incoming-webhook URL directly -- no bot token, no
// channel lookup (the target channel is baked into the URL itself, which is
// how the admin "chooses the channel": they create the webhook in Discord's
// channel settings and paste the URL here). Different auth model from
// lib/discord/dm.ts's bot-token-based sendChannelMessage, so it's not reused.
export interface ShowtimeWebhookResult {
  success: boolean;
  error?: string;
}

export async function postShowtimeWebhook(webhookUrl: string, content: string): Promise<ShowtimeWebhookResult> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`showtime webhook POST failed: ${res.status} ${await res.text()}`);
    }
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
