-- Revoke anon execute from functions that pose real risks.
--
-- auth_is_org_* and can_user_manage_event are intentionally left with
-- anon execute because they are used in RLS policies — revoking would
-- break query evaluation for anonymous users on those tables. They are
-- safe because they call auth.uid() internally and always return false
-- for unauthenticated callers.

-- User lookup — allows enumeration of user IDs by identifier
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_identifier(text) FROM anon;

-- Shift counter mutation — anon users should never decrement shift fills
REVOKE EXECUTE ON FUNCTION public.decrement_shift_filled(uuid) FROM anon;
