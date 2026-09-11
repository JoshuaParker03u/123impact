-- The channel a connected platform's bot commands should be restricted to
-- (Discord's guild-connect flow only for now, but generic enough for any
-- future platform with a similar "which channel" concept).
ALTER TABLE public.platform_connections ADD COLUMN IF NOT EXISTS channel_id TEXT;
