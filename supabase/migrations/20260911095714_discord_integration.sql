-- Add 'discord' to platform_connections' platform CHECK constraint.
-- The original constraint was declared inline (unnamed) in the CREATE TABLE
-- statement, so its actual name depends on Postgres's naming at creation
-- time rather than something we can safely hardcode — look it up dynamically
-- by finding the CHECK constraint attached to the `platform` column.
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT con.conname INTO con_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
  WHERE rel.relname = 'platform_connections'
    AND con.contype = 'c'
    AND att.attname = 'platform';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.platform_connections DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.platform_connections
  ADD CONSTRAINT platform_connections_platform_check
  CHECK (platform IN ('luma', 'eventbrite', 'discord'));

-- access_token is meaningless for Discord's bot-authorization flow (no code
-- exchange happens — the bot acts via a single global bot token, not a
-- per-org access token, so only external_org_id (the guild id) is stored).
-- Relax NOT NULL rather than writing a fake sentinel value.
ALTER TABLE public.platform_connections
  ALTER COLUMN access_token DROP NOT NULL;
