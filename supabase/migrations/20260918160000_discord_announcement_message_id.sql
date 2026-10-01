-- Tracks the most recent Discord announcement message posted for an event
-- or panel, so a re-post can delete the stale one first instead of letting
-- announcements pile up in the channel.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS discord_message_id TEXT;
ALTER TABLE public.panels ADD COLUMN IF NOT EXISTS discord_message_id TEXT;
