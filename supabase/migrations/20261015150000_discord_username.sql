-- Discord bot signups capture the handle Discord already gave us at
-- interaction time, so admin UIs that show "name (contact)" have something
-- to fall back on when email is null (Discord signups don't require one).
ALTER TABLE public.volunteer_registrations
  ADD COLUMN IF NOT EXISTS discord_username TEXT;
