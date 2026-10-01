// Discord's bot-authorization flow doesn't need a token exchange: the bot's
// ability to act in a guild comes from the app's single global bot token
// (Developer Portal), not a per-org access token. This just builds the
// authorize URL — see app/api/auth/integrations/discord/callback/route.ts
// for what the callback does with the resulting guild_id.

// View Channels (0x400) + Send Messages (0x800) — minimal permissions for a
// future bot to post into a channel. Widening this later requires the org
// to re-authorize, so keep it to only what's actually needed.
const BOT_PERMISSIONS = '3072';

export function buildDiscordGuildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id:    process.env.DISCORD_CLIENT_ID!,
    permissions:  BOT_PERMISSIONS,
    scope:        'bot applications.commands',
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/integrations/discord/callback`,
    response_type: 'code',
    state,
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}
