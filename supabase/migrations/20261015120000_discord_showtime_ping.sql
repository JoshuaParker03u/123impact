-- Discord "showtime" ping: posts plain content to an admin-supplied Discord
-- incoming-webhook URL N minutes before an event's (or a specific panel's)
-- start. Presence of the webhook URL is itself the opt-in, mirroring how
-- platform_connections.announcement_channel_id gates the welcome message.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS discord_showtime_webhook_url TEXT,
  ADD COLUMN IF NOT EXISTS discord_showtime_message TEXT,
  ADD COLUMN IF NOT EXISTS discord_showtime_lead_minutes INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS discord_showtime_ping_sent_at TIMESTAMPTZ;

-- panels.discord_showtime_lead_minutes is deliberately nullable with NO
-- default: NULL means "inherit the parent event's lead_minutes." If it
-- defaulted to 15 like the event column, an admin's explicit "15" would be
-- indistinguishable from "never touched this field." Same reasoning for
-- webhook_url/message being null = inherit.
ALTER TABLE public.panels
  ADD COLUMN IF NOT EXISTS discord_showtime_webhook_url TEXT,
  ADD COLUMN IF NOT EXISTS discord_showtime_message TEXT,
  ADD COLUMN IF NOT EXISTS discord_showtime_lead_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS discord_showtime_ping_sent_at TIMESTAMPTZ;

ALTER TABLE public.events
  ADD CONSTRAINT events_discord_showtime_webhook_url_format
    CHECK (discord_showtime_webhook_url IS NULL OR discord_showtime_webhook_url ~* '^https://(discord|discordapp)\.com/api/webhooks/');
ALTER TABLE public.panels
  ADD CONSTRAINT panels_discord_showtime_webhook_url_format
    CHECK (discord_showtime_webhook_url IS NULL OR discord_showtime_webhook_url ~* '^https://(discord|discordapp)\.com/api/webhooks/');

ALTER TABLE public.events
  ADD CONSTRAINT events_discord_showtime_lead_minutes_range
    CHECK (discord_showtime_lead_minutes BETWEEN 1 AND 1440);
ALTER TABLE public.panels
  ADD CONSTRAINT panels_discord_showtime_lead_minutes_range
    CHECK (discord_showtime_lead_minutes IS NULL OR discord_showtime_lead_minutes BETWEEN 1 AND 1440);

-- Resets the one-shot "already pinged" guard when a column that affects
-- WHEN the ping should fire changes, so rescheduling after a ping already
-- fired lets the (correctly re-timed) ping fire again. Deliberately does
-- NOT reset on a webhook_url/message-only edit.
CREATE OR REPLACE FUNCTION public.reset_discord_showtime_ping_on_schedule_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'events' THEN
    IF NEW.date IS DISTINCT FROM OLD.date
       OR NEW.time IS DISTINCT FROM OLD.time
       OR NEW.end_date IS DISTINCT FROM OLD.end_date
       OR NEW.discord_showtime_lead_minutes IS DISTINCT FROM OLD.discord_showtime_lead_minutes THEN
      NEW.discord_showtime_ping_sent_at := NULL;
    END IF;
  ELSIF TG_TABLE_NAME = 'panels' THEN
    IF NEW.panel_date IS DISTINCT FROM OLD.panel_date
       OR NEW.start_time IS DISTINCT FROM OLD.start_time
       OR NEW.discord_showtime_lead_minutes IS DISTINCT FROM OLD.discord_showtime_lead_minutes THEN
      NEW.discord_showtime_ping_sent_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_reset_discord_showtime_ping
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.reset_discord_showtime_ping_on_schedule_change();

CREATE TRIGGER panels_reset_discord_showtime_ping
  BEFORE UPDATE ON public.panels
  FOR EACH ROW EXECUTE FUNCTION public.reset_discord_showtime_ping_on_schedule_change();
