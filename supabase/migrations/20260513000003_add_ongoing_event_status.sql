-- Add 'ongoing' as a valid event status (used for active multi-day events)
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_status_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_status_check
  CHECK (status IN ('active', 'ongoing', 'cancelled', 'completed', 'deleted'));
