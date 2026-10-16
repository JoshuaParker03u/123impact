-- Org-level link to an external volunteer/moderator qualification
-- questionnaire (e.g. a Google Form), surfaced on both the web volunteer
-- signup page and the Discord bot's /signup flow.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS volunteer_qualification_form_url TEXT;

-- Discord bot signups capture Discord username/preferred-name/pronouns
-- instead of requiring an email -- email becomes genuinely optional,
-- not just for the bot but as a column, since there's no cheap way to
-- partially-NOT-NULL a column by origin.
ALTER TABLE public.volunteer_registrations
  ALTER COLUMN email DROP NOT NULL;

-- Shift and RSVP signups already have a Discord-scoped uniqueness guard
-- (idx_volunteer_registrations_discord_shift_unique /
-- idx_volunteer_registrations_discord_rsvp_unique, added in
-- 20260911152452_registration_dedup.sql) so a bot user can't double-sign-up
-- without relying on email. Panels never got the equivalent index, since
-- panel registrations always had a real email until now.
CREATE UNIQUE INDEX IF NOT EXISTS idx_volunteer_registrations_discord_panel_unique
  ON public.volunteer_registrations (panel_id, discord_user_id)
  WHERE discord_user_id IS NOT NULL AND panel_id IS NOT NULL;
