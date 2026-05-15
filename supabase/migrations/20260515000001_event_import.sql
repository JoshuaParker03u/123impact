-- Platform connection credentials per org (one row per platform type)
CREATE TABLE IF NOT EXISTS public.platform_connections (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  platform         TEXT        NOT NULL CHECK (platform IN ('luma', 'eventbrite')),
  access_token     TEXT        NOT NULL,         -- Luma: API key; Eventbrite: OAuth access token
  refresh_token    TEXT,                          -- Eventbrite only
  token_expires_at TIMESTAMPTZ,                  -- Eventbrite only
  external_org_id  TEXT,                          -- Eventbrite organization ID
  sync_new_events  BOOLEAN     NOT NULL DEFAULT FALSE,
  connected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  connected_by     UUID        REFERENCES auth.users(id),
  CONSTRAINT platform_connections_org_platform_key UNIQUE (organization_id, platform)
);

ALTER TABLE public.platform_connections ENABLE ROW LEVEL SECURITY;

-- Sync tracking columns on events
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS platform_source       TEXT        CHECK (platform_source IN ('luma', 'eventbrite')),
  ADD COLUMN IF NOT EXISTS external_id           TEXT,
  ADD COLUMN IF NOT EXISTS platform_image        TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_status           TEXT        CHECK (sync_status IN ('synced', 'failed', 'pending')),
  ADD COLUMN IF NOT EXISTS sync_fail_count       INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_private_on_platform BOOLEAN   NOT NULL DEFAULT FALSE;

-- Prevent importing the same external event twice per org
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_external_org
  ON public.events (organization_id, platform_source, external_id)
  WHERE external_id IS NOT NULL;
