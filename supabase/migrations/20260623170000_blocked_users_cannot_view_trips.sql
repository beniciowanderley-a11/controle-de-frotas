-- Block blocked users from selecting trips
-- This ensures that even if they have an auth session, blocked users cannot query trips.

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth view trips" ON public.trips;

CREATE POLICY "active users view trips" ON public.trips
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR (
      auth.uid() IS NOT NULL AND
      (SELECT status FROM public.profiles WHERE id = auth.uid()) = 'ativo'
    )
  );
