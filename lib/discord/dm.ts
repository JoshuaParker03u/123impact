const DISCORD_API = 'https://discord.com/api/v10';

function authHeaders() {
  return {
    Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

// Retries once if the response is rate-limited (429), waiting the duration
// Discord tells us to via Retry-After before trying again.
async function withRetry(doFetch: () => Promise<Response>): Promise<Response> {
  const res = await doFetch();
  if (res.status !== 429) return res;
  const retryAfter = Number(res.headers.get('retry-after')) || 1;
  await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
  return doFetch();
}

export interface DmResult {
  success: boolean;
  error?: string;
}

// Sends a single Discord DM. Never throws — a failed DM (DMs closed, left
// the guild, blocked the bot — Discord error 50007 is the common case) is
// an expected, non-fatal outcome, not an exception.
export async function sendDirectMessage(discordUserId: string, content: string): Promise<DmResult> {
  try {
    const channelRes = await withRetry(() =>
      fetch(`${DISCORD_API}/users/@me/channels`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ recipient_id: discordUserId }),
      })
    );
    if (!channelRes.ok) throw new Error(`create DM channel failed: ${channelRes.status} ${await channelRes.text()}`);
    const { id: channelId } = await channelRes.json();

    const sendRes = await withRetry(() =>
      fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ content }),
      })
    );
    if (!sendRes.ok) throw new Error(`send DM failed: ${sendRes.status} ${await sendRes.text()}`);

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message ?? String(e) };
  }
}
