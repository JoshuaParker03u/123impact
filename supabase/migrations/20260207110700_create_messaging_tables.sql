-- Messages table (sent message history)
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('all', 'event', 'shift', 'individual')),
  recipient_ids UUID[] DEFAULT '{}',
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES shifts(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  sent_by UUID REFERENCES auth.users(id),
  recipient_count INTEGER DEFAULT 0,
  delivery_status TEXT DEFAULT 'sent' CHECK (delivery_status IN ('sent', 'delivered', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Automated email templates
CREATE TABLE automated_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('signup', '7_days_before', '24_hours_before', '1_hour_before')),
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scheduled emails queue
CREATE TABLE scheduled_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  template_id UUID REFERENCES automated_email_templates(id) ON DELETE CASCADE,
  shift_registration_id UUID REFERENCES shift_registrations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES shifts(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_messages_org ON messages(organization_id);
CREATE INDEX idx_messages_event ON messages(event_id);
CREATE INDEX idx_messages_shift ON messages(shift_id);
CREATE INDEX idx_messages_sent_at ON messages(sent_at DESC);
CREATE INDEX idx_messages_delivery ON messages(delivery_status);
CREATE INDEX idx_templates_org ON automated_email_templates(organization_id);
CREATE INDEX idx_templates_event ON automated_email_templates(event_id);
CREATE INDEX idx_templates_enabled ON automated_email_templates(enabled);
CREATE INDEX idx_scheduled_org ON scheduled_emails(organization_id);
CREATE INDEX idx_scheduled_status ON scheduled_emails(status, scheduled_for);
CREATE INDEX idx_scheduled_user ON scheduled_emails(user_id);

-- RLS Policies
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE automated_email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_emails ENABLE ROW LEVEL SECURITY;

-- Organization admins can manage messages in their org
CREATE POLICY "Org admins can manage messages" ON messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_admins
      WHERE organization_admins.organization_id = messages.organization_id
      AND organization_admins.user_id = auth.uid()
      AND (organization_admins.permissions->>'can_send_messages')::boolean = true
    )
  );

-- Organization admins can manage templates in their org
CREATE POLICY "Org admins can manage templates" ON automated_email_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_admins
      WHERE organization_admins.organization_id = automated_email_templates.organization_id
      AND organization_admins.user_id = auth.uid()
    )
  );

-- Organization admins can view scheduled emails in their org
CREATE POLICY "Org admins can view scheduled emails" ON scheduled_emails
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_admins
      WHERE organization_admins.organization_id = scheduled_emails.organization_id
      AND organization_admins.user_id = auth.uid()
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_templates_updated_at
  BEFORE UPDATE ON automated_email_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();