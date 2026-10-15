-- Replaces the single-lead-time showtime ping with multiple independent
-- reminder tiers (e.g. 1hr / 30min / starting-now) per event or panel.
-- events.discord_showtime_webhook_url / panels.discord_showtime_webhook_url
-- (and their format CHECKs) are untouched -- still one shared webhook per
-- owner, just multiple reminders against it now.
CREATE TABLE public.discord_showtime_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  panel_id UUID REFERENCES public.panels(id) ON DELETE CASCADE,
  lead_minutes INTEGER NOT NULL CHECK (lead_minutes BETWEEN 0 AND 1440), -- 0 = "starting now"
  message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((event_id IS NOT NULL) <> (panel_id IS NOT NULL))
);

-- A single full (non-partial) constraint spanning both owner columns --
-- NULLS NOT DISTINCT makes two rows with the same (event_id, NULL,
-- lead_minutes) collide (standard SQL otherwise treats NULL as never equal
-- to NULL, which would let the same lead_minutes be inserted for the same
-- event an unlimited number of times). A partial unique index per owner
-- column was tried first but doesn't work here: Postgres's ON CONFLICT
-- (cols) inference (what supabase-js's upsert({onConflict}) generates)
-- can't match a partial index without repeating its WHERE predicate, which
-- the simple column-list form doesn't support.
ALTER TABLE public.discord_showtime_reminders
  ADD CONSTRAINT discord_showtime_reminders_owner_lead_unique
  UNIQUE NULLS NOT DISTINCT (event_id, panel_id, lead_minutes);

-- Carry forward existing single-value config as one reminder row each --
-- only for owners that actually had a webhook set (i.e. only the ones that
-- would have fired before). A panel with no webhook of its own was only
-- ever firing via the event's shared webhook cascading to its own start
-- time; that cascade is being deliberately dropped (see below), so there is
-- nothing to carry forward for those panels.
INSERT INTO public.discord_showtime_reminders (event_id, lead_minutes, message, sent_at)
SELECT id, discord_showtime_lead_minutes, discord_showtime_message, discord_showtime_ping_sent_at
FROM public.events WHERE discord_showtime_webhook_url IS NOT NULL;

INSERT INTO public.discord_showtime_reminders (panel_id, lead_minutes, message, sent_at)
SELECT id, COALESCE(discord_showtime_lead_minutes, 15), discord_showtime_message, discord_showtime_ping_sent_at
FROM public.panels WHERE discord_showtime_webhook_url IS NOT NULL;

DROP TRIGGER IF EXISTS events_reset_discord_showtime_ping ON public.events;
DROP TRIGGER IF EXISTS panels_reset_discord_showtime_ping ON public.panels;
DROP FUNCTION IF EXISTS public.reset_discord_showtime_ping_on_schedule_change();

ALTER TABLE public.events
  DROP COLUMN discord_showtime_message,
  DROP COLUMN discord_showtime_lead_minutes,
  DROP COLUMN discord_showtime_ping_sent_at;
ALTER TABLE public.panels
  DROP COLUMN discord_showtime_message,
  DROP COLUMN discord_showtime_lead_minutes,
  DROP COLUMN discord_showtime_ping_sent_at;

-- Resets every one of an owner's reminders when ITS OWN schedule changes
-- (so a rescheduled event/panel re-fires at the new time), without
-- resetting on a message/webhook-only edit. Unlike the old single-column
-- version, this updates the child table rather than mutating NEW.
CREATE OR REPLACE FUNCTION public.reset_discord_showtime_reminders_on_schedule_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'events' THEN
    IF NEW.date IS DISTINCT FROM OLD.date
       OR NEW.time IS DISTINCT FROM OLD.time
       OR NEW.end_date IS DISTINCT FROM OLD.end_date THEN
      UPDATE public.discord_showtime_reminders SET sent_at = NULL WHERE event_id = NEW.id;
    END IF;
  ELSIF TG_TABLE_NAME = 'panels' THEN
    IF NEW.panel_date IS DISTINCT FROM OLD.panel_date
       OR NEW.start_time IS DISTINCT FROM OLD.start_time THEN
      UPDATE public.discord_showtime_reminders SET sent_at = NULL WHERE panel_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_reset_discord_showtime_reminders
  AFTER UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.reset_discord_showtime_reminders_on_schedule_change();

CREATE TRIGGER panels_reset_discord_showtime_reminders
  AFTER UPDATE ON public.panels
  FOR EACH ROW EXECUTE FUNCTION public.reset_discord_showtime_reminders_on_schedule_change();
