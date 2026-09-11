-- Keep the earliest row per (event, normalized email, role) group among
-- RSVP-style registrations (no shift); delete the rest. All known
-- duplicates at time of writing are staging dev/test data.
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

-- Which Discord account (if any) completed a bot-originated signup.
ALTER TABLE public.volunteer_registrations ADD COLUMN IF NOT EXISTS discord_user_id TEXT;

-- Same Discord account can't claim the same shift, or the same event+role,
-- twice — regardless of email typed into the modal each time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_volunteer_registrations_discord_shift_unique
  ON public.volunteer_registrations (shift_id, discord_user_id)
  WHERE discord_user_id IS NOT NULL AND shift_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_volunteer_registrations_discord_rsvp_unique
  ON public.volunteer_registrations (event_id, attendee_type, discord_user_id)
  WHERE discord_user_id IS NOT NULL AND shift_id IS NULL;
