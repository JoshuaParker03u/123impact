-- The inviter now specifies the session topic when sending the invite
-- (rather than the invitee typing it during signup), so it needs to live on
-- the invite itself until acceptance, when it's copied onto the resulting
-- registration's existing speaker_topic column.
ALTER TABLE public.event_speaker_invites
  ADD COLUMN IF NOT EXISTS topic TEXT;
