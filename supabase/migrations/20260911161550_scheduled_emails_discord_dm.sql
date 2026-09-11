-- Discord user to DM for this row. Populated directly at insert time for
-- admin-scheduled messages (no volunteer_registration_id exists on that
-- row shape to join through); resolved via a join at cron-read time for
-- automated-template rows instead (see app/api/cron/send-scheduled-emails).
ALTER TABLE public.scheduled_emails ADD COLUMN IF NOT EXISTS discord_user_id TEXT;

-- Independent of the existing email status/error_message columns — a DM
-- can fail (or have no recipient) while the paired email still sends.
ALTER TABLE public.scheduled_emails ADD COLUMN IF NOT EXISTS dm_status TEXT
  CHECK (dm_status IN ('pending', 'sent', 'failed', 'skipped'));
