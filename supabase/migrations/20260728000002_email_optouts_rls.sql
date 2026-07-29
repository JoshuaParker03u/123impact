-- email_optouts had no RLS at all, unlike every other table in the schema —
-- meaning it was reachable via the public PostgREST API using just the anon
-- key. Every place that touches this table (app/api/optout, the
-- process-optouts cron, lib/email.ts) already uses the service role, which
-- bypasses RLS regardless — so locking it down with zero policies is safe
-- and doesn't require any app changes.
ALTER TABLE public.email_optouts ENABLE ROW LEVEL SECURITY;
