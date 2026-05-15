-- Event daily schedule
-- One row per calendar day the event operates.
-- Single-day events: one row. Multi-day: one row per day.
-- Events with no rows fall back to event.time display (backward compat).

CREATE TABLE IF NOT EXISTS public.event_day_hours (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  event_date TEXT        NOT NULL,
  start_time TEXT        NOT NULL,
  end_time   TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, event_date)
);

CREATE INDEX IF NOT EXISTS idx_event_day_hours_event ON public.event_day_hours(event_id);

ALTER TABLE public.event_day_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read event day hours"
  ON public.event_day_hours FOR SELECT USING (true);

CREATE POLICY "Org admins can manage event day hours"
  ON public.event_day_hours FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.organization_admins oa ON oa.organization_id = e.organization_id
      WHERE e.id = event_day_hours.event_id
        AND oa.user_id = auth.uid()
    )
  );
