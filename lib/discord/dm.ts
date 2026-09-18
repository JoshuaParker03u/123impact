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
  messageId?: string;
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

// Posts directly to a guild channel — no DM-channel-creation step needed,
// unlike sendDirectMessage. Same never-throws contract. Returns the new
// message's id so callers can track it (e.g. to delete a stale announcement
// on the next re-post).
export async function sendChannelMessage(channelId: string, content: string): Promise<DmResult> {
  try {
    const res = await withRetry(() =>
      fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ content }),
      })
    );
    if (!res.ok) throw new Error(`send channel message failed: ${res.status} ${await res.text()}`);
    const message = await res.json();
    return { success: true, messageId: message.id };
  } catch (e: any) {
    return { success: false, error: e.message ?? String(e) };
  }
}

// Deletes a message the bot previously posted to a channel — used to clear
// a stale announcement before posting its replacement. Only ever deletes
// the bot's own messages, so no permission beyond SEND_MESSAGES is needed.
// A 404 (already gone — deleted manually, or the channel itself changed)
// is treated as success, not an error; this never blocks posting the new
// message.
export async function deleteChannelMessage(channelId: string, messageId: string): Promise<void> {
  const res = await withRetry(() =>
    fetch(`${DISCORD_API}/channels/${channelId}/messages/${messageId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`delete channel message failed: ${res.status} ${await res.text()}`);
  }
}
