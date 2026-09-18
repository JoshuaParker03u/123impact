-- Closes a race condition in the Discord/Eventbrite OAuth callbacks: both
-- only guarded against "this external account already belongs to another
-- org" with a SELECT-then-INSERT check at the application layer, which two
-- near-simultaneous connection attempts for the same guild/account could
-- both pass before either row exists. NULLs (Luma connections don't set
-- external_org_id) are unaffected — a unique index allows any number of
-- NULLs, but the WHERE clause makes that explicit.
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_connections_platform_external_org
  ON public.platform_connections (platform, external_org_id)
  WHERE external_org_id IS NOT NULL;
