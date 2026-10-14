-- Enriches the public events feed (app/api/public/organizations/[orgId]/events.json):
--   - platform_connections.invite_url: admin-set permanent Discord invite link,
--     surfaced as the feed's venues[].join — the one spec field with no data
--     source until now.
--   - volunteer_registrations.pronouns, .links: optional enrichment for
--     already-consenting speakers (never gates who appears in the feed,
--     only adds detail once someone already appears).
ALTER TABLE public.platform_connections
  ADD COLUMN IF NOT EXISTS invite_url TEXT;

ALTER TABLE public.volunteer_registrations
  ADD COLUMN IF NOT EXISTS pronouns TEXT,
  ADD COLUMN IF NOT EXISTS links JSONB NOT NULL DEFAULT '[]'::jsonb;
