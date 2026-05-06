-- ============================================================
-- Analytics & Tracking — Prerequisite Column Additions
-- ============================================================
-- "Returning" volunteer definition: an email that has appeared in
-- volunteer_registrations for any other event under the same
-- organization_id, with a registered_at earlier than the registrations
-- for the current event. Computed server-side via CTE in the analytics
-- API routes.
-- ============================================================

-- 1. Event format + online/recording URLs
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_format  TEXT NOT NULL DEFAULT 'in_person'
    CHECK (event_format IN ('in_person', 'online', 'hybrid')),
  ADD COLUMN IF NOT EXISTS online_url    TEXT,
  ADD COLUMN IF NOT EXISTS recording_url TEXT;

-- 2. Attendee type on registrations
ALTER TABLE public.volunteer_registrations
  ADD COLUMN IF NOT EXISTS attendee_type TEXT NOT NULL DEFAULT 'volunteer'
    CHECK (attendee_type IN ('volunteer', 'attendee', 'speaker'));

CREATE INDEX IF NOT EXISTS idx_vr_attendee_type
  ON public.volunteer_registrations(attendee_type);

-- 3. Link type on QR code instances (tracking links reuse same table + scan infra)
ALTER TABLE public.qr_code_instances
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'qr'
    CHECK (type IN ('qr', 'link'));

CREATE INDEX IF NOT EXISTS idx_qci_type
  ON public.qr_code_instances(event_id, type);
