-- Deleting a speaker's volunteer_registrations row (removal from the
-- Volunteers page, event deletion cascade, org deletion cascade, or the
-- dedicated registration-removal API route — there are several call sites)
-- left the linked event_speaker_invites row stuck showing "Accepted" with a
-- now-dangling registration_id, since only the FK's ON DELETE SET NULL
-- fired, not a status change. A trigger fixes this for every call site at
-- once instead of patching each one individually.
CREATE OR REPLACE FUNCTION public.revoke_speaker_invite_on_registration_delete()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.event_speaker_invites
  SET status = 'revoked', registration_id = NULL, updated_at = NOW()
  WHERE registration_id = OLD.id AND status = 'accepted';
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_revoke_speaker_invite_on_registration_delete ON public.volunteer_registrations;

CREATE TRIGGER trg_revoke_speaker_invite_on_registration_delete
  BEFORE DELETE ON public.volunteer_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.revoke_speaker_invite_on_registration_delete();
