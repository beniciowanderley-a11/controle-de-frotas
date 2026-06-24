
-- Add FK so PostgREST can embed profiles via trip_passengers.user_id
ALTER TABLE public.trip_passengers
  ADD CONSTRAINT trip_passengers_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Allow any authenticated user to update trips
DROP POLICY IF EXISTS "owner or admin update trips" ON public.trips;
CREATE POLICY "authenticated can update trips"
  ON public.trips FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
