-- A panel on an online/hybrid event may need its own join link (e.g. a
-- breakout room distinct from the event's main online_url).
ALTER TABLE public.panels ADD COLUMN IF NOT EXISTS online_url TEXT;
