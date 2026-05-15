ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id      TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id  TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS subscription_status     TEXT DEFAULT 'inactive'
    CHECK (subscription_status IN ('active','past_due','canceled','unpaid','inactive')),
  ADD COLUMN IF NOT EXISTS billing_interval        TEXT CHECK (billing_interval IN ('month','year')),
  ADD COLUMN IF NOT EXISTS current_period_end      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS grace_period_end        TIMESTAMPTZ;
