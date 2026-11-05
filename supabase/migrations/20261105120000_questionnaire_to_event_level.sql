-- The volunteer/moderator qualification questionnaire moves from the
-- organization to the event: an org running multiple events couldn't
-- otherwise ask a different screening question per event. Backfill before
-- dropping so events under an org that already set one don't lose it.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS volunteer_qualification_form_url TEXT;

UPDATE public.events
SET volunteer_qualification_form_url = organizations.volunteer_qualification_form_url
FROM public.organizations
WHERE events.organization_id = organizations.id
  AND organizations.volunteer_qualification_form_url IS NOT NULL;

ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS volunteer_qualification_form_url;
