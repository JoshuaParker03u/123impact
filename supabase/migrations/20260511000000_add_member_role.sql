-- Expand organization_admins role constraint to include 'member'
ALTER TABLE organization_admins DROP CONSTRAINT organization_admins_role_check;
ALTER TABLE organization_admins ADD CONSTRAINT organization_admins_role_check
  CHECK (role IN ('owner', 'admin', 'member'));
