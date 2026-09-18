import { SupabaseClient } from '@supabase/supabase-js';
import { sendChannelMessage } from './dm';

const WELCOME_MESSAGE = [
  "👋 Thanks for adding 123impact! Use `/signup` in this server to browse upcoming volunteer shifts, panels, and events, and register right from Discord.",
  'An org admin can change which channel `/signup` responds in, or where announcements like this one are posted, from Settings → Integrations on 123impact.',
].join('\n\n');

// Sends the one-time welcome/instructions message to a channel, marking
// platform_connections.welcome_message_sent_at so it's never repeated.
// Called from two places: right after the bot joins a guild (if it has a
// system channel), and whenever an org sets an announcement channel for the
// first time (covers guilds with no system channel, or where that post
// silently failed, e.g. missing permission).
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

  const result = await sendChannelMessage(channelId, WELCOME_MESSAGE);
  if (result.success) {
    await service
      .from('platform_connections')
      .update({ welcome_message_sent_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .eq('platform', 'discord');
  }
}
