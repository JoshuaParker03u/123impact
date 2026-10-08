-- Baseline for the 8 tables that predate migration tracking entirely:
-- organizations, events, shifts, organization_admins, volunteer_registrations,
-- plus 3 more found the same way once replay got further: shift_registrations,
-- organization_volunteers, usernames. None of them are ever CREATE TABLE'd by
-- any other migration in this directory -- they were created directly against
-- the remote project before migration history began, and every later
-- migration already assumes they exist. Without this file, a fresh
-- `supabase db reset`/`db pull` shadow replay fails immediately on the first
-- tracked migration (20260207110700_create_messaging_tables.sql) with
-- "relation organizations does not exist".
--
-- shift_registrations/organization_volunteers/usernames are never ALTERed by
-- any tracked migration either, so unlike the first 5, their CURRENT shape
-- (columns, constraints, indexes) IS their original shape -- copied verbatim
-- from the schema-only dump, no column subtraction needed. Every policy on
-- all 8 tables IS created by a later tracked migration (guarded with
-- DROP POLICY IF EXISTS), EXCEPT the ones listed below that aren't -- those
-- are reconstructed here too.
--
-- Deliberately contains only each table's ORIGINAL column set -- i.e. every
-- column later added via `ADD COLUMN IF NOT EXISTS` in a tracked migration
-- is left OUT here on purpose, so those migrations run for real instead of
-- silently no-op'ing (which would also skip any FK/CHECK/UNIQUE constraint
-- declared inline on that column). Likewise, every RLS policy that a later
-- migration creates (even unguarded, relying on this being the first time)
-- is left out here so that migration is the one that actually creates it.
--
-- What IS included below is only what's never touched by a later tracked
-- migration, reconstructed from a schema-only `supabase db dump --linked`
-- against staging on 2026-10-01: PKs, the FKs/indexes/policies/functions/
-- triggers that no migration ever creates, and the one exception --
-- organization_admins_role_check -- whose later DROP (20260511000000) has
-- no IF EXISTS guard, so a constraint of that exact name must already
-- exist or that migration errors outright.
--
-- Known residual gap: auth_is_org_owner() is also untracked/original and
-- is NOT reconstructed here, since nothing on these 5 tables depends on it
-- at creation time. If something needs it locally, pull it from staging
-- the same way this file was built.

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text,
  website text,
  contact_email text,
  contact_phone text,
  address text,
  city text,
  state text,
  zip_code text,
  logo_url text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT organizations_status_check CHECK (status IN ('active', 'inactive', 'suspended'))
);
ALTER TABLE ONLY public.organizations ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_organizations_status ON public.organizations (status);

CREATE TABLE IF NOT EXISTS public.events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_id text NOT NULL,
  title text NOT NULL,
  description text,
  date date NOT NULL,
  time text NOT NULL,
  location text NOT NULL,
  image_url text,
  created_at timestamptz DEFAULT now(),
  primary_owner_id uuid,
  co_sponsors uuid[] DEFAULT '{}'::uuid[],
  organization_id uuid,
  status text DEFAULT 'active',
  updated_at timestamptz
);
ALTER TABLE ONLY public.events ADD CONSTRAINT events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.events ADD CONSTRAINT events_event_id_key UNIQUE (event_id);
ALTER TABLE ONLY public.events
  ADD CONSTRAINT events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
ALTER TABLE ONLY public.events
  ADD CONSTRAINT events_primary_owner_id_fkey FOREIGN KEY (primary_owner_id) REFERENCES auth.users(id);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_events_event_id ON public.events (event_id);
CREATE INDEX IF NOT EXISTS idx_events_organization_id ON public.events (organization_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events (status);

CREATE TABLE IF NOT EXISTS public.organization_admins (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text DEFAULT 'admin',
  permissions jsonb DEFAULT '{"can_edit_events": true, "can_delete_events": true, "can_manage_admins": false, "can_send_messages": true}'::jsonb,
  invited_by uuid,
  joined_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  -- Original pre-2026-05-11 shape (no 'member' yet) -- named exactly so
  -- 20260511000000_add_member_role.sql's unguarded DROP CONSTRAINT succeeds.
  CONSTRAINT organization_admins_role_check CHECK (role IN ('owner', 'admin'))
);
ALTER TABLE ONLY public.organization_admins ADD CONSTRAINT organization_admins_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.organization_admins
  ADD CONSTRAINT organization_admins_organization_id_user_id_key UNIQUE (organization_id, user_id);
ALTER TABLE ONLY public.organization_admins
  ADD CONSTRAINT organization_admins_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.organization_admins
  ADD CONSTRAINT organization_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.organization_admins
  ADD CONSTRAINT organization_admins_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);
ALTER TABLE public.organization_admins ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_org_admins_organization_id ON public.organization_admins (organization_id);
CREATE INDEX IF NOT EXISTS idx_org_admins_role ON public.organization_admins (role);
CREATE INDEX IF NOT EXISTS idx_org_admins_user_id ON public.organization_admins (user_id);

CREATE TABLE IF NOT EXISTS public.shifts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_id uuid,
  shift_id integer NOT NULL,
  name text NOT NULL,
  description text,
  start_time time NOT NULL,
  end_time time NOT NULL,
  capacity integer NOT NULL,
  filled integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);
ALTER TABLE ONLY public.shifts ADD CONSTRAINT shifts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.shifts ADD CONSTRAINT unique_event_shift UNIQUE (event_id, shift_id);
ALTER TABLE ONLY public.shifts
  ADD CONSTRAINT shifts_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_shifts_event_id ON public.shifts (event_id);

CREATE TABLE IF NOT EXISTS public.volunteer_registrations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shift_id uuid NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  registered_at timestamptz DEFAULT now()
);
ALTER TABLE ONLY public.volunteer_registrations ADD CONSTRAINT volunteer_registrations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.volunteer_registrations ADD CONSTRAINT unique_email_per_shift UNIQUE (shift_id, email);
ALTER TABLE ONLY public.volunteer_registrations
  ADD CONSTRAINT volunteer_registrations_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE CASCADE;
ALTER TABLE public.volunteer_registrations ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_registrations_email ON public.volunteer_registrations (email);
CREATE INDEX IF NOT EXISTS idx_registrations_shift_id ON public.volunteer_registrations (shift_id);

CREATE TABLE IF NOT EXISTS public.shift_registrations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shift_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text DEFAULT 'confirmed',
  registered_at timestamptz DEFAULT now(),
  notes text,
  CONSTRAINT shift_registrations_status_check CHECK (status IN ('confirmed', 'cancelled', 'completed'))
);
ALTER TABLE ONLY public.shift_registrations ADD CONSTRAINT shift_registrations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.shift_registrations
  ADD CONSTRAINT shift_registrations_shift_id_user_id_key UNIQUE (shift_id, user_id);
ALTER TABLE ONLY public.shift_registrations
  ADD CONSTRAINT shift_registrations_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.shift_registrations
  ADD CONSTRAINT shift_registrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.shift_registrations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.organization_volunteers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  first_volunteer_date date,
  total_hours_volunteered numeric(10,2) DEFAULT 0,
  status text DEFAULT 'active',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT organization_volunteers_status_check CHECK (status IN ('active', 'inactive', 'banned'))
);
ALTER TABLE ONLY public.organization_volunteers ADD CONSTRAINT organization_volunteers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.organization_volunteers
  ADD CONSTRAINT organization_volunteers_organization_id_user_id_key UNIQUE (organization_id, user_id);
ALTER TABLE ONLY public.organization_volunteers
  ADD CONSTRAINT organization_volunteers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.organization_volunteers
  ADD CONSTRAINT organization_volunteers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.organization_volunteers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_org_volunteers_organization_id ON public.organization_volunteers (organization_id);
CREATE INDEX IF NOT EXISTS idx_org_volunteers_status ON public.organization_volunteers (status);
CREATE INDEX IF NOT EXISTS idx_org_volunteers_user_id ON public.organization_volunteers (user_id);

CREATE TABLE IF NOT EXISTS public.usernames (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  username text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE ONLY public.usernames ADD CONSTRAINT usernames_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.usernames ADD CONSTRAINT usernames_username_key UNIQUE (username);
ALTER TABLE ONLY public.usernames
  ADD CONSTRAINT usernames_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.usernames ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_usernames_user_id ON public.usernames (user_id);
CREATE INDEX IF NOT EXISTS idx_usernames_username ON public.usernames (username);

-- These SQL-language functions get their bodies resolved against real
-- relations at CREATE time (unlike plpgsql, which only syntax-checks), so
-- they must come after every table above that they reference.

CREATE OR REPLACE FUNCTION auth_is_org_admin(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_admins
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION auth_is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_admins
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION auth_user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM organization_admins WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Also untracked/original (confirmed: no migration ever CREATEs these), and
-- needed because 20260227000002_fix_function_search_paths.sql ALTERs most
-- of them expecting them to already exist.

CREATE OR REPLACE FUNCTION auth_is_org_owner(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_admins
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
      AND (role = 'owner' OR (permissions->>'can_manage_admins')::boolean = true)
  );
$$;

CREATE OR REPLACE FUNCTION can_user_manage_event(p_event_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM events e
    INNER JOIN organization_admins oa ON oa.organization_id = e.organization_id
    WHERE e.id = p_event_id
      AND oa.user_id = p_user_id
      AND (oa.role IN ('owner', 'admin') OR (oa.permissions->>'can_edit_events')::boolean = true)
  ) OR EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = p_event_id AND e.primary_owner_id = p_user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION decrement_shift_filled(p_shift_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE shifts
  SET filled = GREATEST(filled - 1, 0)
  WHERE id = p_shift_id;
$$;

CREATE OR REPLACE FUNCTION get_shift_volunteer_count(shift_uuid uuid)
RETURNS integer
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COUNT(*)::INTEGER
  FROM volunteer_registrations
  WHERE shift_id = shift_uuid;
$$;

CREATE OR REPLACE FUNCTION is_shift_full(shift_uuid uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT filled >= capacity
  FROM shifts
  WHERE id = shift_uuid;
$$;

CREATE OR REPLACE FUNCTION is_username_available(check_username text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM public.usernames
    WHERE LOWER(username) = LOWER(check_username)
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_user_id_by_identifier(identifier text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result_user_id UUID;
BEGIN
  SELECT user_id INTO result_user_id
  FROM public.usernames
  WHERE LOWER(username) = LOWER(identifier)
  LIMIT 1;

  IF result_user_id IS NULL THEN
    SELECT id INTO result_user_id
    FROM auth.users
    WHERE LOWER(email) = LOWER(identifier)
    LIMIT 1;
  END IF;

  RETURN result_user_id;
END;
$$;

-- Policies and triggers that no other migration ever creates (every other
-- policy on these 5 tables is created, guarded or first-time, by a later
-- tracked migration -- leave those to run normally).

-- DROP POLICY IF EXISTS guards added retroactively: this file's CREATE
-- POLICY statements originally assumed a database where these 8 tables'
-- policies never existed yet (true for staging's shadow replay and local
-- dev). Production already has every one of these policies live since
-- before migration tracking began, so an unguarded CREATE POLICY would
-- abort with "policy already exists" when this file is finally applied
-- there. The guards are no-ops anywhere the policy doesn't exist yet.

DROP POLICY IF EXISTS "Admins can update their organizations" ON public.organizations;
CREATE POLICY "Admins can update their organizations" ON public.organizations
  FOR UPDATE USING (auth_is_org_admin(id));

DROP POLICY IF EXISTS "Users can view their organizations" ON public.organizations;
CREATE POLICY "Users can view their organizations" ON public.organizations
  FOR SELECT USING (id IN (SELECT auth_user_org_ids()));

DROP POLICY IF EXISTS "Admins can create events" ON public.events;
CREATE POLICY "Admins can create events" ON public.events
  FOR INSERT WITH CHECK (auth_is_org_admin(organization_id));

CREATE OR REPLACE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP POLICY IF EXISTS "Public can view shifts" ON public.shifts;
CREATE POLICY "Public can view shifts" ON public.shifts
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Admins can insert shifts" ON public.shifts;
CREATE POLICY "Admins can insert shifts" ON public.shifts
  FOR INSERT WITH CHECK (event_id IN (SELECT events.id FROM events WHERE events.organization_id IN (SELECT auth_user_org_ids())));

DROP POLICY IF EXISTS "Admins can update shifts" ON public.shifts;
CREATE POLICY "Admins can update shifts" ON public.shifts
  FOR UPDATE USING (event_id IN (SELECT events.id FROM events WHERE events.organization_id IN (SELECT auth_user_org_ids())));

DROP POLICY IF EXISTS "Admins can delete shifts" ON public.shifts;
CREATE POLICY "Admins can delete shifts" ON public.shifts
  FOR DELETE USING (event_id IN (SELECT events.id FROM events WHERE events.organization_id IN (SELECT auth_user_org_ids())));

CREATE OR REPLACE TRIGGER update_shifts_updated_at BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP POLICY IF EXISTS "Public can insert volunteer_registrations" ON public.volunteer_registrations;
CREATE POLICY "Public can insert volunteer_registrations" ON public.volunteer_registrations
  FOR INSERT TO authenticated, anon WITH CHECK (true);
