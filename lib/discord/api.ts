const DISCORD_API = 'https://discord.com/api/v10';

async function discordFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`Discord API error ${res.status} on ${path}: ${await res.text()}`);
  return res;
}

// Registers the /signup command for one guild. Guild-scoped commands appear
// within seconds, unlike global commands which can take up to an hour to
// propagate — appropriate here since each guild only needs the command the
// moment its org connects.
export async function registerGuildCommand(guildId: string): Promise<void> {
  await discordFetch(`/applications/${process.env.DISCORD_CLIENT_ID}/guilds/${guildId}/commands`, {
    method: 'PUT',
    body: JSON.stringify([
      { name: 'signup', description: 'Sign up for an upcoming volunteer event or shift', type: 1 },
    ]),
  });
}

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  position: number;
}

// GUILD_TEXT (0) and GUILD_ANNOUNCEMENT (5) — the channel types slash
// commands can meaningfully be restricted to.
const TEXT_CHANNEL_TYPES = new Set([0, 5]);

export async function listGuildChannels(guildId: string): Promise<DiscordChannel[]> {
  const res = await discordFetch(`/guilds/${guildId}/channels`, { method: 'GET' });
  const channels: DiscordChannel[] = await res.json();
  return channels
    .filter((c) => TEXT_CHANNEL_TYPES.has(c.type))
    .sort((a, b) => a.position - b.position);
}

// Edits the original interaction response. Authorized by the interaction
// token itself (valid 15 minutes) — no bot token needed for this call.
export async function editOriginalResponse(interactionToken: string, body: unknown): Promise<void> {
  const res = await fetch(`${DISCORD_API}/webhooks/${process.env.DISCORD_CLIENT_ID}/${interactionToken}/messages/@original`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Discord editOriginalResponse error ${res.status}: ${await res.text()}`);
}
