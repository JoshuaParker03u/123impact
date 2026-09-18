-- Lets a message be scoped to a panel's registrants, same as event/shift.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS panel_id UUID REFERENCES panels(id) ON DELETE CASCADE;
ALTER TABLE scheduled_emails ADD COLUMN IF NOT EXISTS panel_id UUID REFERENCES panels(id) ON DELETE CASCADE;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_recipient_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_recipient_type_check
  CHECK (recipient_type IN ('all', 'event', 'shift', 'panel', 'individual'));
