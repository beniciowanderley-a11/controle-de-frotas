DROP POLICY IF EXISTS "auth insert trips" ON public.trips;
CREATE POLICY "admin insert trips" ON public.trips FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') AND auth.uid() = created_by);