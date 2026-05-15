-- Shiftless events: volunteers register at the event level with no shift selection
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_shiftless BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS shiftless_capacity INTEGER;

-- Make shift_id nullable so shiftless registrations can omit it
ALTER TABLE public.volunteer_registrations
  ALTER COLUMN shift_id DROP NOT NULL;

-- Add event_id directly for efficient event-level queries
ALTER TABLE public.volunteer_registrations
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE CASCADE;

-- Backfill event_id for existing shift-based registrations
UPDATE public.volunteer_registrations vr
  SET event_id = s.event_id
  FROM public.shifts s
  WHERE vr.shift_id = s.id AND vr.event_id IS NULL;
