CREATE TABLE IF NOT EXISTS public.email_optouts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT        NOT NULL,
  opted_out_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  purged_at    TIMESTAMPTZ,
  CONSTRAINT email_optouts_email_key UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_email_optouts_email ON public.email_optouts (lower(email));
