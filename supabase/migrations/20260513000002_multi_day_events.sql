-- Multi-day event support
-- end_date = NULL means single-day event (uses event.date)
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS end_date TEXT;

-- shift_date = NULL means shift inherits event.date (single-day compatible)
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS shift_date TEXT;
