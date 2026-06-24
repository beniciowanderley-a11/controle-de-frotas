
-- Tighten INSERT policies (require authenticated user)
DROP POLICY "auth insert vehicles" ON public.vehicles;
CREATE POLICY "auth insert vehicles" ON public.vehicles FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY "auth insert drivers" ON public.drivers;
CREATE POLICY "auth insert drivers" ON public.drivers FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY "auth insert destinations" ON public.destinations;
CREATE POLICY "auth insert destinations" ON public.destinations FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- Restrict SECURITY DEFINER function execution
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
