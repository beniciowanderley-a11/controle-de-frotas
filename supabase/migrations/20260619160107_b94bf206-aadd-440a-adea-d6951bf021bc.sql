
-- Tighten notifications insert: only system (via triggers as security definer) creates
DROP POLICY IF EXISTS "Authenticated can create notifications" ON public.notifications;

-- Revoke execute on trigger-only security-definer functions
REVOKE EXECUTE ON FUNCTION public.check_trip_capacity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_passenger_added() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
