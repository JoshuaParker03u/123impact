CREATE TABLE IF NOT EXISTS public.org_custom_domains (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID        NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  subdomain          TEXT        NOT NULL UNIQUE,
  dns_admin_email    TEXT,
  verification_token TEXT        NOT NULL,
  token_expires_at   TIMESTAMPTZ NOT NULL,
  status             TEXT        NOT NULL DEFAULT 'setup_initiated'
                     CHECK (status IN (
                       'setup_initiated','email_sent','pending_verification',
                       'active','verification_failed','ssl_error','disconnected'
                     )),
  ssl_expires_at     TIMESTAMPTZ,
  primary_color      TEXT,
  banner_image_url   TEXT,
  header_links       JSONB       NOT NULL DEFAULT '[]',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.org_custom_domains ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_org_custom_domains_subdomain ON public.org_custom_domains (subdomain);
CREATE INDEX IF NOT EXISTS idx_org_custom_domains_token ON public.org_custom_domains (verification_token);
