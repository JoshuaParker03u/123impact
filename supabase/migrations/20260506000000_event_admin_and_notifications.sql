-- ============================================================
-- Event Admin Role + Notifications
-- ============================================================

-- 1. Add plan column to organizations (Stripe prep)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'
  CONSTRAINT organizations_plan_check
    CHECK (plan IN ('free', 'starter', 'pro', 'enterprise'));

-- 2. Event admin assignments
CREATE TABLE IF NOT EXISTS public.event_admin_assignments (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id                 UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  email                   TEXT        NOT NULL,
  invited_by              UUID        NOT NULL REFERENCES auth.users(id),
  token                   TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status                  TEXT        NOT NULL DEFAULT 'pending'
                                      CHECK (status IN ('active','pending','expired','revoked','void')),
  expires_at              TIMESTAMPTZ NOT NULL,
  co_sponsor              BOOLEAN     NOT NULL DEFAULT false,
  co_sponsor_org_id       UUID        REFERENCES public.organizations(id) ON DELETE SET NULL,
  data_policy_accepted_at TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eaa_event  ON public.event_admin_assignments(event_id);
CREATE INDEX IF NOT EXISTS idx_eaa_user   ON public.event_admin_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_eaa_token  ON public.event_admin_assignments(token);
CREATE INDEX IF NOT EXISTS idx_eaa_status ON public.event_admin_assignments(status);

ALTER TABLE public.event_admin_assignments ENABLE ROW LEVEL SECURITY;

-- All mutations go through service-role API routes.
-- Allow event admins to read their own assignment (for dashboard/invite acceptance).
-- Org admin reads are handled server-side via service role.
CREATE POLICY "Event admins can view own assignment"
  ON public.event_admin_assignments FOR SELECT
  USING (user_id = auth.uid());

-- 3. Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  title      TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  link       TEXT,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_user   ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_unread ON public.notifications(user_id) WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid());
