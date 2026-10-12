-- NULL capacity means unlimited attendees for a panel (admin leaves the
-- Attendee Capacity field blank). All application-level reads/writes treat
-- NULL explicitly as "no limit" rather than falling through to JS's
-- `n >= null` coercion (which evaluates as `n >= 0`, always true).
ALTER TABLE public.panels ALTER COLUMN capacity DROP NOT NULL;
