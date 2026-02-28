-- Fix mutable search_path on all public functions.
-- Without a fixed search_path, a superuser or object-creator could shadow
-- referenced tables/functions by injecting objects earlier in the search path.

ALTER FUNCTION public.is_username_available SET search_path = public, pg_temp;
ALTER FUNCTION public.get_user_id_by_identifier SET search_path = public, pg_temp;
ALTER FUNCTION public.get_shift_volunteer_count SET search_path = public, pg_temp;
ALTER FUNCTION public.is_shift_full SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column SET search_path = public, pg_temp;
ALTER FUNCTION public.can_user_manage_event SET search_path = public, pg_temp;
