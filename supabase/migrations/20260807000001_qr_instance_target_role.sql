-- QR/tracking-link instances need to target a specific signup role now that
-- Volunteer/Attendee/Speaker are separate pages. Speaker is invite-only (no
-- QR/link makes sense there), so this only ever needs to be volunteer or
-- attendee. Existing rows default to volunteer, preserving current behavior.
ALTER TABLE public.qr_code_instances
  ADD COLUMN IF NOT EXISTS target_role TEXT NOT NULL DEFAULT 'volunteer'
    CHECK (target_role IN ('volunteer', 'attendee'));
