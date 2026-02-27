-- ============================================================
-- RLS Performance Fixes
-- ============================================================
-- Addresses two classes of issues flagged by the Supabase linter:
--
-- 1. auth_rls_initplan
--    auth.uid() is a volatile function; without wrapping it calls
--    re-evaluate it once per row.  Wrapping in (SELECT auth.uid())
--    promotes it to a stable subquery evaluated once per statement.
--
-- 2. multiple_permissive_policies
--    Multiple permissive SELECT policies on the same table are
--    OR-ed together and each evaluated per row, compounding cost.
--    Consolidating them into a single policy eliminates this.
--
-- Affected tables
--   auth_rls_initplan      : usernames, shift_registrations,
--                            organization_admins, events,
--                            organization_volunteers
--   multiple_permissive    : events, organization_admins,
--                            organization_volunteers,
--                            shift_registrations,
--                            volunteer_registrations
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- TABLE: usernames
-- Fix: auth_rls_initplan (3 policies)
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can read own username"   ON usernames;
DROP POLICY IF EXISTS "Users can update own username" ON usernames;
DROP POLICY IF EXISTS "Users can insert own username" ON usernames;

CREATE POLICY "Users can read own username" ON usernames
  FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own username" ON usernames
  FOR UPDATE
  USING     (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own username" ON usernames
  FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ────────────────────────────────────────────────────────────
-- TABLE: organization_admins
-- Fix: auth_rls_initplan + multiple_permissive_policies (SELECT)
--
-- Previous SELECT policies (3 → consolidated to 1):
--   "Users can view own admin record"  USING (user_id = auth.uid())
--   "Admins can view org members"      USING (EXISTS (...same org...))
--   "Owners can manage org admins"     FOR ALL  ← split: keep mutations
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own admin record" ON organization_admins;
DROP POLICY IF EXISTS "Admins can view org members"     ON organization_admins;
DROP POLICY IF EXISTS "Owners can manage org admins"    ON organization_admins;

-- Unified SELECT: own record OR any record in an org the caller belongs to
CREATE POLICY "Select organization_admins" ON organization_admins
  FOR SELECT USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM organization_admins oa
      WHERE oa.organization_id = organization_admins.organization_id
        AND oa.user_id = (SELECT auth.uid())
    )
  );

-- Owner-only mutations (previously covered by the FOR ALL policy)
CREATE POLICY "Owners can insert org admins" ON organization_admins
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_admins oa
      WHERE oa.organization_id = organization_admins.organization_id
        AND oa.user_id = (SELECT auth.uid())
        AND oa.role = 'owner'
    )
  );

CREATE POLICY "Owners can update org admins" ON organization_admins
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_admins oa
      WHERE oa.organization_id = organization_admins.organization_id
        AND oa.user_id = (SELECT auth.uid())
        AND oa.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_admins oa
      WHERE oa.organization_id = organization_admins.organization_id
        AND oa.user_id = (SELECT auth.uid())
        AND oa.role = 'owner'
    )
  );

CREATE POLICY "Owners can delete org admins" ON organization_admins
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM organization_admins oa
      WHERE oa.organization_id = organization_admins.organization_id
        AND oa.user_id = (SELECT auth.uid())
        AND oa.role = 'owner'
    )
  );


-- ────────────────────────────────────────────────────────────
-- TABLE: events
-- Fix: auth_rls_initplan (select/update/delete)
--      + multiple_permissive_policies (SELECT)
--
-- Previous SELECT policies (2 → consolidated to 1):
--   "Admins can select events"      USING (EXISTS (...org member...))
--   "Public can view active events" USING (status = 'active')
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can select events"      ON events;
DROP POLICY IF EXISTS "Public can view active events" ON events;
DROP POLICY IF EXISTS "Admins can update events"      ON events;
DROP POLICY IF EXISTS "Admins can delete events"      ON events;

-- Unified SELECT: public sees active/published events; org members see all their org's events
CREATE POLICY "Select events" ON events
  FOR SELECT USING (
    status IN ('active', 'published')
    OR EXISTS (
      SELECT 1 FROM organization_admins
      WHERE organization_id = events.organization_id
        AND user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins can update events" ON events
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_admins
      WHERE organization_id = events.organization_id
        AND user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_admins
      WHERE organization_id = events.organization_id
        AND user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can delete events" ON events
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM organization_admins
      WHERE organization_id = events.organization_id
        AND user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  );


-- ────────────────────────────────────────────────────────────
-- TABLE: organization_volunteers
-- Fix: auth_rls_initplan + multiple_permissive_policies (SELECT)
--
-- Previous SELECT policies (2 → consolidated to 1):
--   "Users can view own volunteer record" USING (user_id = auth.uid())
--   "Admins can manage volunteers"        FOR ALL  ← split: keep mutations
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own volunteer record" ON organization_volunteers;
DROP POLICY IF EXISTS "Admins can manage volunteers"        ON organization_volunteers;

-- Unified SELECT: own record OR any org admin of that org
CREATE POLICY "Select organization_volunteers" ON organization_volunteers
  FOR SELECT USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM organization_admins
      WHERE organization_id = organization_volunteers.organization_id
        AND user_id = (SELECT auth.uid())
    )
  );

-- Admin mutations (previously covered by the FOR ALL policy)
CREATE POLICY "Admins can insert volunteers" ON organization_volunteers
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_admins
      WHERE organization_id = organization_volunteers.organization_id
        AND user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins can update volunteers" ON organization_volunteers
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_admins
      WHERE organization_id = organization_volunteers.organization_id
        AND user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_admins
      WHERE organization_id = organization_volunteers.organization_id
        AND user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins can delete volunteers" ON organization_volunteers
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM organization_admins
      WHERE organization_id = organization_volunteers.organization_id
        AND user_id = (SELECT auth.uid())
    )
  );


-- ────────────────────────────────────────────────────────────
-- TABLE: shift_registrations
-- Fix: auth_rls_initplan + multiple_permissive_policies (SELECT)
--
-- Previous SELECT policies (2 → consolidated to 1):
--   "Users can manage own shift registrations" FOR ALL  ← split: keep mutations
--   "Admins can view shift registrations"      FOR SELECT
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can manage own shift registrations" ON shift_registrations;
DROP POLICY IF EXISTS "Admins can view shift registrations"      ON shift_registrations;

-- Unified SELECT: own record OR org admin via shift → event → org chain
CREATE POLICY "Select shift_registrations" ON shift_registrations
  FOR SELECT USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM organization_admins oa
      JOIN shifts s ON s.id = shift_registrations.shift_id
      JOIN events e ON e.id = s.event_id
      WHERE oa.organization_id = e.organization_id
        AND oa.user_id = (SELECT auth.uid())
    )
  );

-- User self-service mutations (previously covered by the FOR ALL policy)
CREATE POLICY "Users can insert own shift registrations" ON shift_registrations
  FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own shift registrations" ON shift_registrations
  FOR UPDATE
  USING     (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own shift registrations" ON shift_registrations
  FOR DELETE
  USING (user_id = (SELECT auth.uid()));


-- ────────────────────────────────────────────────────────────
-- TABLE: volunteer_registrations
-- Fix: multiple_permissive_policies (SELECT)
--
-- Previous SELECT policies (2 → consolidated to 1):
--   "Admins can view volunteer registrations"
--   "Org admins can view registrations"
-- (No direct user_id column — access scoped via shift → event → org)
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can view volunteer registrations" ON volunteer_registrations;
DROP POLICY IF EXISTS "Org admins can view registrations"       ON volunteer_registrations;

-- Consolidated: any org admin whose org owns the event for this registration's shift
CREATE POLICY "Select volunteer_registrations" ON volunteer_registrations
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM organization_admins oa
      JOIN shifts s ON s.id = volunteer_registrations.shift_id
      JOIN events e ON e.id = s.event_id
      WHERE oa.organization_id = e.organization_id
        AND oa.user_id = (SELECT auth.uid())
    )
  );

-- Public INSERT: anyone (including unauthenticated users) can submit a volunteer
-- registration. The public sign-up form relies on this.
DROP POLICY IF EXISTS "Anyone can register as volunteer" ON volunteer_registrations;
CREATE POLICY "Anyone can register as volunteer" ON volunteer_registrations
  FOR INSERT
  WITH CHECK (true);
