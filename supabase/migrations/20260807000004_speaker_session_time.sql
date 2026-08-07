-- The host schedules when each talk happens (independent of whether the
-- speaker has accepted yet) — stored as "HH:MM" text, matching how
-- events.time and shifts.start_time/end_time are already stored.
ALTER TABLE public.event_speaker_invites
  ADD COLUMN IF NOT EXISTS session_time TEXT;
