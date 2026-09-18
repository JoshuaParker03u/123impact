import { SupabaseClient } from '@supabase/supabase-js';
import { sendChannelMessage } from './dm';
import { baseEmbed } from './embed';

// A function, not a module-level constant — baseEmbed() stamps the current
// time, which would otherwise freeze at whenever this module first loaded.
function buildWelcomeEmbed() {
  return baseEmbed({
    title: '👋 Thanks for adding 123impact!',
    description: [
      "Use `/signup` in this server to browse upcoming volunteer shifts, panels, and events, and register right from Discord.",
      'An org admin can change which channel `/signup` responds in, or where announcements like this one are posted, from **Settings → Integrations** on 123impact.',
    ].join('\n\n'),
  });
}

// Sends the one-time welcome/instructions message to a channel, marking
// platform_connections.welcome_message_sent_at so it's never repeated.
// The bot never auto-posts anywhere on its own — this only fires once an
// org explicitly sets its announcement channel (deliberately not falling
// back to the guild's default channel; orgs are steered toward a channel
// only the bot posts in, not wherever regular chat happens).
export async function maybeSendWelcomeMessage(
  service: SupabaseClient,
  organizationId: string,
  channelId: string
): Promise<void> {
  const { data: connection } = await service
    .from('platform_connections')
    .select('welcome_message_sent_at')
    .eq('organization_id', organizationId)
    .eq('platform', 'discord')
    .single();

  if (!connection || connection.welcome_message_sent_at) return;

  const result = await sendChannelMessage(channelId, { embeds: [buildWelcomeEmbed()] });
  if (result.success) {
    await service
      .from('platform_connections')
      .update({ welcome_message_sent_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .eq('platform', 'discord');
  }
}
