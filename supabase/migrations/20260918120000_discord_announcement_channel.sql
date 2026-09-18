-- A separate, general-purpose "where the bot posts announcements" channel,
-- distinct from the existing channel_id (which only restricts /signup).
-- welcome_message_sent_at dedupes the one-time welcome message, which can
-- fire from either the OAuth join callback (best-effort, guild system
-- channel) or the first time an org sets this setting.
ALTER TABLE public.platform_connections
  ADD COLUMN IF NOT EXISTS announcement_channel_id TEXT,
  ADD COLUMN IF NOT EXISTS welcome_message_sent_at TIMESTAMPTZ;
