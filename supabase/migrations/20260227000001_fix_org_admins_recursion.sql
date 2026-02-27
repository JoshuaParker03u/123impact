-- ============================================================
-- Fix: infinite recursion in organization_admins SELECT policy
-- ============================================================
-- The consolidated SELECT policy introduced in 20260227000000
-- caused infinite recursion because the EXISTS subquery queries
-- organization_admins from within organization_admins's own
-- RLS policy, triggering the same policy again endlessly.
--
-- Solution: SECURITY DEFINER helper functions that bypass RLS
-- for the membership check, breaking the recursion cycle.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- Helper functions (SECURITY DEFINER = bypass RLS internally)
-- ────────────────────────────────────────────────────────────

-- Returns true if the current user belongs to the given org
-- (any role: owner, admin, member, etc.)
-- Uses p_org_id to match the existing function signature (CREATE OR REPLACE
-- updates the body in-place without disturbing dependent policies).
CREATE OR REPLACE FUNCTION auth_is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_admins
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
  );
$$;

-- Returns true if the current user is an owner or admin of the given org
CREATE OR REPLACE FUNCTION auth_is_org_admin(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_admins
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;


-- ────────────────────────────────────────────────────────────
-- TABLE: organization_admins — replace recursive policy
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Select organization_admins" ON organization_admins;

CREATE POLICY "Select organization_admins" ON organization_admins
  FOR SELECT USING (
    user_id = (SELECT auth.uid())
    OR auth_is_org_member(organization_id)
  );


-- ────────────────────────────────────────────────────────────
-- TABLE: organization_admins — use helper in mutation policies
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Owners can insert org admins" ON organization_admins;
DROP POLICY IF EXISTS "Owners can update org admins" ON organization_admins;
DROP POLICY IF EXISTS "Owners can delete org admins" ON organization_admins;

CREATE POLICY "Owners can insert org admins" ON organization_admins
  FOR INSERT
  WITH CHECK (auth_is_org_admin(organization_id));

CREATE POLICY "Owners can update org admins" ON organization_admins
  FOR UPDATE
  USING     (auth_is_org_admin(organization_id))
  WITH CHECK (auth_is_org_admin(organization_id));

CREATE POLICY "Owners can delete org admins" ON organization_admins
  FOR DELETE
  USING (auth_is_org_admin(organization_id));


-- ────────────────────────────────────────────────────────────
-- TABLE: events — use helper (cleaner, avoids nested RLS)
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Select events"        ON events;
DROP POLICY IF EXISTS "Admins can update events" ON events;
DROP POLICY IF EXISTS "Admins can delete events" ON events;

CREATE POLICY "Select events" ON events
  FOR SELECT USING (
    status IN ('active', 'published')
    OR auth_is_org_member(organization_id)
  );

CREATE POLICY "Admins can update events" ON events
  FOR UPDATE
  USING     (auth_is_org_admin(organization_id))
  WITH CHECK (auth_is_org_admin(organization_id));

CREATE POLICY "Admins can delete events" ON events
  FOR DELETE
  USING (auth_is_org_admin(organization_id));


-- ────────────────────────────────────────────────────────────
-- TABLE: organization_volunteers — use helper
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Select organization_volunteers" ON organization_volunteers;
DROP POLICY IF EXISTS "Admins can insert volunteers"   ON organization_volunteers;
DROP POLICY IF EXISTS "Admins can update volunteers"   ON organization_volunteers;
DROP POLICY IF EXISTS "Admins can delete volunteers"   ON organization_volunteers;

CREATE POLICY "Select organization_volunteers" ON organization_volunteers
  FOR SELECT USING (
    user_id = (SELECT auth.uid())
    OR auth_is_org_member(organization_id)
  );

CREATE POLICY "Admins can insert volunteers" ON organization_volunteers
  FOR INSERT
  WITH CHECK (auth_is_org_member(organization_id));

CREATE POLICY "Admins can update volunteers" ON organization_volunteers
  FOR UPDATE
  USING     (auth_is_org_member(organization_id))
  WITH CHECK (auth_is_org_member(organization_id));

CREATE POLICY "Admins can delete volunteers" ON organization_volunteers
  FOR DELETE
  USING (auth_is_org_member(organization_id));


-- ────────────────────────────────────────────────────────────
-- TABLE: shift_registrations — use helper for admin SELECT
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Select shift_registrations" ON shift_registrations;

CREATE POLICY "Select shift_registrations" ON shift_registrations
  FOR SELECT USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM shifts s
      JOIN events e ON e.id = s.event_id
      WHERE s.id = shift_registrations.shift_id
        AND auth_is_org_member(e.organization_id)
    )
  );


-- ────────────────────────────────────────────────────────────
-- TABLE: volunteer_registrations — use helper for admin SELECT
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Select volunteer_registrations" ON volunteer_registrations;

CREATE POLICY "Select volunteer_registrations" ON volunteer_registrations
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM shifts s
      JOIN events e ON e.id = s.event_id
      WHERE s.id = volunteer_registrations.shift_id
        AND auth_is_org_member(e.organization_id)
    )
  );
