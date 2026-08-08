-- Recurring events: instances generated from a "repeat" setup at creation
-- time share a series_id (a plain grouping value, not a separate table —
-- the recurrence rule itself doesn't need to persist since v1 generates a
-- bounded batch upfront rather than an ongoing cron). Used to find sibling
-- occurrences for the optional "apply to all future occurrences" edit flow.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS series_id UUID;

CREATE INDEX IF NOT EXISTS idx_events_series_id ON public.events (series_id) WHERE series_id IS NOT NULL;
