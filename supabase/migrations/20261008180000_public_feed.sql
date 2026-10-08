-- Public events/sessions/people feed (JSON + iCal) for external sites to
-- consume cross-origin. Additive columns only:
--   - organizations.timezone: IANA id, used for the feed's time_zone field
--     and iCal TZID. Null -> feed falls back to emitting UTC.
--   - volunteer_registrations.public_consent: the feed-inclusion gate. A
--     speaker/panelist only appears in the public feed after explicitly
--     consenting ("media release") — defaults false everywhere, including
--     existing rows, so nobody is retroactively exposed.
--   - volunteer_registrations.photo_url: optional headshot for the feed's
--     person.photo field.
--   - panel_assignments.role gains 'moderator' alongside the existing
--     'speaker'/'volunteer'.
--   - platform_connections.external_org_name: human-readable Discord guild
--     name for display (independent of any future multi-connection work —
--     this is just a label for today's single connection per org).

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS timezone TEXT;

ALTER TABLE public.volunteer_registrations
  ADD COLUMN IF NOT EXISTS public_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

ALTER TABLE public.panel_assignments
  DROP CONSTRAINT IF EXISTS panel_assignments_role_check;
ALTER TABLE public.panel_assignments
  ADD CONSTRAINT panel_assignments_role_check
    CHECK (role IN ('speaker', 'volunteer', 'moderator'));

ALTER TABLE public.platform_connections
  ADD COLUMN IF NOT EXISTS external_org_name TEXT;
