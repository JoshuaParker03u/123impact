-- ============================================================
-- Event roles: Attendee (RSVP) + Speaker (invite-only RSVP)
-- ============================================================

-- 0. gen_random_bytes() (used for the invite token below, same as
-- event_admin_assignments.token) lives in pgcrypto. Supabase installs it
-- into a dedicated "extensions" schema rather than public, which isn't
-- always on this role's search_path — add it for this migration so the
-- unqualified call below resolves regardless of which schema it landed in.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
SET LOCAL search_path TO public, extensions;

-- 1. Per-event role enablement (Volunteer is implicit/always-on via
--    existing shifts/is_shiftless config, so it needs no flag here).
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS attendee_enabled   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attendee_capacity  INTEGER,
  ADD COLUMN IF NOT EXISTS speaker_enabled    BOOLEAN NOT NULL DEFAULT false;

-- 2. Speaker-only signup fields
ALTER TABLE public.volunteer_registrations
  ADD COLUMN IF NOT EXISTS speaker_bio   TEXT,
  ADD COLUMN IF NOT EXISTS speaker_topic TEXT;

-- 3. Speaker invites — same token/status/expiry shape as
--    event_admin_assignments, but no user_id/login involved: accepting an
--    invite just submits an anonymous registration like any other role.
CREATE TABLE IF NOT EXISTS public.event_speaker_invites (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  email           TEXT        NOT NULL,
  invited_by      UUID        NOT NULL REFERENCES auth.users(id),
  token           TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at      TIMESTAMPTZ NOT NULL,
  registration_id UUID        REFERENCES public.volunteer_registrations(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esi_event  ON public.event_speaker_invites(event_id);
CREATE INDEX IF NOT EXISTS idx_esi_token  ON public.event_speaker_invites(token);
CREATE INDEX IF NOT EXISTS idx_esi_status ON public.event_speaker_invites(status);

ALTER TABLE public.event_speaker_invites ENABLE ROW LEVEL SECURITY;
-- No public policies — all reads/writes go through service-role API routes
-- (invite creation/listing is org-admin only; token lookup is public but
-- must stay unauthenticated, so it's served by a service-role route too).

-- 4. Fix "Select volunteer_registrations": it only resolved the owning org
-- via shift_id -> shifts -> events, so any row with shift_id IS NULL was
-- silently excluded from every browser-client read (admin Volunteers page,
-- messaging, etc.) — the same bug already fixed for the DELETE policy
-- (20260728000003) but missed here. Attendee/Speaker registrations always
-- have shift_id NULL, so without this fix the roles being added above
-- would never be visible to admins.
DROP POLICY IF EXISTS "Select volunteer_registrations" ON volunteer_registrations;

CREATE POLICY "Select volunteer_registrations" ON volunteer_registrations
  FOR SELECT USING (
    (event_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = volunteer_registrations.event_id
        AND auth_is_org_member(e.organization_id)
    ))
    OR
    (shift_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM shifts s
      JOIN events e ON e.id = s.event_id
      WHERE s.id = volunteer_registrations.shift_id
        AND auth_is_org_member(e.organization_id)
    ))
  );
