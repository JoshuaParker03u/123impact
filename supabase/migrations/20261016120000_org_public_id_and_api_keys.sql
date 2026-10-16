-- public_id is a one-way-derived identifier (HMAC-SHA256 of the org's real
-- id, computed in application code -- the secret it's keyed on isn't
-- available to plain SQL) used in place of the raw UUID in public, no-login
-- URLs (the events feed). Nullable/lazily generated: the first time
-- anything asks for an org's public_id, it gets computed and persisted
-- here, rather than backfilled up front.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS public_id TEXT UNIQUE;

-- Per-organization Bearer API keys -- infrastructure for future
-- authenticated endpoints, not wired into any route yet. Only the SHA-256
-- hash of each key is ever stored, same principle as a password; the full
-- key is shown to the admin exactly once, at generation time.
CREATE TABLE IF NOT EXISTS public.organization_api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  key_prefix      TEXT NOT NULL,
  key_hash        TEXT NOT NULL,
  created_by      UUID NOT NULL REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at    TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_api_keys_hash ON public.organization_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_org_api_keys_org_active ON public.organization_api_keys(organization_id) WHERE revoked_at IS NULL;

-- Service-role only, same pattern as panels/event_speaker_invites: no
-- client-readable policy -- every access path goes through a server route
-- that independently verifies org-admin membership first.
ALTER TABLE public.organization_api_keys ENABLE ROW LEVEL SECURITY;
