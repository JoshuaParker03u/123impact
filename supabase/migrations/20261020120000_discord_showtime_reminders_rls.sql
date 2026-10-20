-- discord_showtime_reminders shipped without RLS enabled at all (an
-- oversight in 20261015130000) -- flagged CRITICAL by Supabase's security
-- advisor on both staging and production: a public-schema table with RLS
-- disabled is unrestricted for anon/authenticated roles regardless of what
-- the app's own routes check.
--
-- The cron job and every admin API route already use the service-role
-- client here (bypasses RLS entirely, unaffected either way). The one real
-- client-side write path is EventModal/PanelModal, which call
-- saveShowtimeReminders() with the browser (anon-key) client directly --
-- that's the access this policy needs to keep working. No public-read
-- policy: unlike event_day_hours (public schedule info), reminder config
-- (lead times, internal messages) has no legitimate public-read use case,
-- so this is org-admin-only in both directions.
ALTER TABLE public.discord_showtime_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can manage discord showtime reminders"
  ON public.discord_showtime_reminders FOR ALL
  USING (
    (event_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.organization_admins oa ON oa.organization_id = e.organization_id
      WHERE e.id = discord_showtime_reminders.event_id
        AND oa.user_id = auth.uid()
    ))
    OR
    (panel_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.panels p
      JOIN public.events e ON e.id = p.event_id
      JOIN public.organization_admins oa ON oa.organization_id = e.organization_id
      WHERE p.id = discord_showtime_reminders.panel_id
        AND oa.user_id = auth.uid()
    ))
  )
  WITH CHECK (
    (event_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.organization_admins oa ON oa.organization_id = e.organization_id
      WHERE e.id = discord_showtime_reminders.event_id
        AND oa.user_id = auth.uid()
    ))
    OR
    (panel_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.panels p
      JOIN public.events e ON e.id = p.event_id
      JOIN public.organization_admins oa ON oa.organization_id = e.organization_id
      WHERE p.id = discord_showtime_reminders.panel_id
        AND oa.user_id = auth.uid()
    ))
  );
