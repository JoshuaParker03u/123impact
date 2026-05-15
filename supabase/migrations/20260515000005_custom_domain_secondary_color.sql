ALTER TABLE public.org_custom_domains
  ADD COLUMN IF NOT EXISTS secondary_color TEXT;
