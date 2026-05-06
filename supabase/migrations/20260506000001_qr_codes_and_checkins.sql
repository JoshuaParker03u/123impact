-- ============================================================
-- QR Code Instances, Scan Tracking, and Check-Ins
-- ============================================================

-- 1. QR code placement instances (Type 1 — Event Registration)
--    Multiple instances per event, each tracked separately.
CREATE TABLE IF NOT EXISTS public.qr_code_instances (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID    NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  organization_id UUID    NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label           TEXT    NOT NULL DEFAULT 'Default',
  ref_token       TEXT    NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex'),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qci_event  ON public.qr_code_instances(event_id);
CREATE INDEX IF NOT EXISTS idx_qci_token  ON public.qr_code_instances(ref_token);
CREATE INDEX IF NOT EXISTS idx_qci_active ON public.qr_code_instances(event_id, is_active);

ALTER TABLE public.qr_code_instances ENABLE ROW LEVEL SECURITY;

-- Anyone can read instances (scan tracking redirect needs token lookup)
CREATE POLICY "Public can read active qr instances"
  ON public.qr_code_instances FOR SELECT
  USING (is_active = true);

-- 2. Anonymous scan events (Type 1 only — date only, no PII)
CREATE TABLE IF NOT EXISTS public.qr_scan_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES public.qr_code_instances(id) ON DELETE CASCADE,
  event_id    UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  scan_date   DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_qse_instance ON public.qr_scan_events(instance_id);
CREATE INDEX IF NOT EXISTS idx_qse_event    ON public.qr_scan_events(event_id);

ALTER TABLE public.qr_scan_events ENABLE ROW LEVEL SECURITY;

-- Scan inserts are public (anonymous tracking)
CREATE POLICY "Anyone can insert scan events"
  ON public.qr_scan_events FOR INSERT
  WITH CHECK (true);

-- Org admins can read scan counts for their events
CREATE POLICY "Org admins can read scan events"
  ON public.qr_scan_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.qr_code_instances qci
      WHERE qci.id = instance_id
        AND auth_is_org_admin(qci.organization_id)
    )
  );

-- 3. Check-in records (permanent ledger — no cascade deletes)
CREATE TABLE IF NOT EXISTS public.check_ins (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID        NOT NULL,  -- intentionally no FK cascade
  event_id        UUID        NOT NULL,  -- permanent ledger entry
  checked_in_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_in_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL
);

-- One check-in record per registration
CREATE UNIQUE INDEX IF NOT EXISTS idx_check_ins_unique ON public.check_ins(registration_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_event ON public.check_ins(event_id);

ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;

-- Staff can insert check-ins (enforced in API, permissive here)
CREATE POLICY "Authenticated users can insert check-ins"
  ON public.check_ins FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Registrant can read their own check-in, staff read handled via service role
CREATE POLICY "Anyone can read check-ins"
  ON public.check_ins FOR SELECT
  USING (true);
