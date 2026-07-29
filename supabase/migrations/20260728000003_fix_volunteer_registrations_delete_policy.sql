-- "Admins can delete volunteer registrations" only matched rows via
-- shift_id -> shifts -> events, so shiftless registrations (shift_id IS
-- NULL) never matched at all and couldn't be deleted by anyone, including
-- real org admins. event_id is populated on every registration in
-- practice (shift-based or shiftless), but it's nullable at the schema
-- level rather than an enforced constraint — so resolve the org via
-- either event_id or shift_id, whichever is present, rather than
-- assuming one is always set.

DROP POLICY IF EXISTS "Admins can delete volunteer registrations" ON public.volunteer_registrations;

CREATE POLICY "Admins can delete volunteer registrations" ON public.volunteer_registrations
  FOR DELETE
  USING (
    (event_id IS NOT NULL AND event_id IN (
      SELECT e.id FROM public.events e
      WHERE auth_is_org_admin(e.organization_id)
    ))
    OR
    (shift_id IS NOT NULL AND shift_id IN (
      SELECT s.id FROM public.shifts s
      JOIN public.events e ON e.id = s.event_id
      WHERE auth_is_org_admin(e.organization_id)
    ))
  );
