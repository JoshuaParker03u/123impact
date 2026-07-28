-- Lets staff distinguish a manual "mark as checked in" override (from the
-- no-show list) from a normal scan/self check-in. Nullable/defaulted so it's
-- purely additive — no backfill needed, existing rows just read as false.
ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS is_override BOOLEAN NOT NULL DEFAULT false;
