CREATE TABLE public.panels (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  start_time     TEXT NOT NULL,
  end_time       TEXT NOT NULL,
  panel_date     TEXT,
  location       TEXT,
  capacity       INTEGER NOT NULL,
  allow_waitlist BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
-- RLS enabled, no policies — service-role-only, same as event_speaker_invites.
-- All access goes through admin-gated server routes, never direct client writes.
ALTER TABLE public.panels ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.volunteer_registrations
  ADD COLUMN IF NOT EXISTS panel_id UUID REFERENCES public.panels(id) ON DELETE CASCADE;

CREATE TABLE public.panel_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_id        UUID NOT NULL REFERENCES public.panels(id) ON DELETE CASCADE,
  registration_id UUID NOT NULL REFERENCES public.volunteer_registrations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('speaker', 'volunteer')),
  assigned_by     UUID NOT NULL REFERENCES auth.users(id),
  assigned_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (panel_id, registration_id, role)
);
ALTER TABLE public.panel_assignments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS panels_enabled BOOLEAN NOT NULL DEFAULT false;

-- The existing dedup index (20260911152452) would otherwise block the same
-- email from RSVPing to a *second* panel at the same event, since panel
-- rows also have shift_id IS NULL. Narrow it to plain event-level RSVPs
-- (panel_id IS NULL) and add a separate panel-scoped uniqueness rule.
DROP INDEX IF EXISTS idx_volunteer_registrations_rsvp_unique;
CREATE UNIQUE INDEX idx_volunteer_registrations_rsvp_unique
  ON public.volunteer_registrations (event_id, attendee_type, (lower(trim(email))))
  WHERE shift_id IS NULL AND panel_id IS NULL;

CREATE UNIQUE INDEX idx_volunteer_registrations_panel_unique
  ON public.volunteer_registrations (panel_id, (lower(trim(email))))
  WHERE panel_id IS NOT NULL;

CREATE INDEX idx_panels_event ON public.panels(event_id);
CREATE INDEX idx_panel_assignments_panel ON public.panel_assignments(panel_id);
