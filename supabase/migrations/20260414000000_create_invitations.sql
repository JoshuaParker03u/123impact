-- Organization invitations table
-- Tracks email invitations sent by org admins/owners.
-- All status mutations go through service-role API routes.

CREATE TABLE organization_invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  token           TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  invited_by      UUID NOT NULL REFERENCES auth.users(id),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invitations_org    ON organization_invitations(organization_id);
CREATE INDEX idx_invitations_token  ON organization_invitations(token);
CREATE INDEX idx_invitations_email  ON organization_invitations(email);
CREATE INDEX idx_invitations_status ON organization_invitations(status);

ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Org members can view invitations for their org
CREATE POLICY "Members can view invitations" ON organization_invitations
  FOR SELECT USING (auth_is_org_member(organization_id));

-- Org admins/owners can create invitations
CREATE POLICY "Admins can create invitations" ON organization_invitations
  FOR INSERT WITH CHECK (auth_is_org_admin(organization_id));
