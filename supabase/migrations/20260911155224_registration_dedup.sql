-- Keep the earliest row per (event, normalized email, role) group among
-- RSVP-style registrations (no shift); delete the rest, so the unique
-- index below can be created. Verified against production data before
-- this migration was applied — see deployment notes.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY event_id, lower(trim(email)), attendee_type
    ORDER BY registered_at ASC
  ) AS rn
  FROM public.volunteer_registrations
  WHERE shift_id IS NULL
)
DELETE FROM public.volunteer_registrations WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Prevent future duplicates: same event + role + email (case/whitespace
-- insensitive) can't register twice via the RSVP path. Shift-based signups
-- already have equivalent protection via an existing (untracked) constraint
-- on (shift_id, email).
CREATE UNIQUE INDEX IF NOT EXISTS idx_volunteer_registrations_rsvp_unique
  ON public.volunteer_registrations (event_id, attendee_type, (lower(trim(email))))
  WHERE shift_id IS NULL;
