-- Optional scoping/expiry for organization_api_keys, added after the first
-- version shipped with no restriction mechanism at all. All three are
-- nullable, null meaning unrestricted/never-expires -- same idiom already
-- used throughout this schema (panel/shift capacity, etc.) rather than a
-- separate "is this restricted" flag.
ALTER TABLE public.organization_api_keys
  ADD COLUMN IF NOT EXISTS allowed_formats TEXT[],
  ADD COLUMN IF NOT EXISTS allowed_resources TEXT[],
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
