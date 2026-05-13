-- Tighten check_ins SELECT policy: require authentication.
-- The previous USING (true) allowed anonymous enumeration of all check-in records.
-- The API layer uses the service role for staff reads, so no app code is affected.

DROP POLICY IF EXISTS "Anyone can read check-ins" ON public.check_ins;

CREATE POLICY "Authenticated users can read check-ins"
  ON public.check_ins FOR SELECT
  USING (auth.uid() IS NOT NULL);
