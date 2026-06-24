
-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill existing users
INSERT INTO public.profiles (id, email, full_name)
SELECT id, COALESCE(email, ''), COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email)
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Extend handle_new_user trigger to also create profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ TRIPS: drop free-text passageiros ============
ALTER TABLE public.trips DROP COLUMN IF EXISTS passageiros;

-- ============ TRIP_PASSENGERS ============
CREATE TABLE public.trip_passengers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  destination_id UUID NOT NULL REFERENCES public.destinations(id),
  added_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trip_id, user_id)
);

CREATE INDEX idx_trip_passengers_trip ON public.trip_passengers(trip_id);
CREATE INDEX idx_trip_passengers_user ON public.trip_passengers(user_id);

GRANT SELECT, INSERT, DELETE ON public.trip_passengers TO authenticated;
GRANT ALL ON public.trip_passengers TO service_role;

ALTER TABLE public.trip_passengers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view trip passengers" ON public.trip_passengers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can add passengers" ON public.trip_passengers
  FOR INSERT TO authenticated WITH CHECK (added_by = auth.uid());

CREATE POLICY "Self, adder or admin can remove passenger" ON public.trip_passengers
  FOR DELETE TO authenticated USING (
    user_id = auth.uid()
    OR added_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

-- Capacity check trigger
CREATE OR REPLACE FUNCTION public.check_trip_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cap INT;
  current_count INT;
BEGIN
  SELECT v.capacidade INTO cap
  FROM public.trips t
  JOIN public.vehicles v ON v.id = t.vehicle_id
  WHERE t.id = NEW.trip_id;

  IF cap IS NULL THEN
    RETURN NEW; -- no capacity defined, allow
  END IF;

  SELECT COUNT(*) INTO current_count
  FROM public.trip_passengers
  WHERE trip_id = NEW.trip_id;

  -- capacity includes driver seat? we treat capacidade as total passenger seats
  IF current_count >= cap THEN
    RAISE EXCEPTION 'Capacidade do veículo esgotada (% lugares)', cap;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trip_passengers_capacity_check
  BEFORE INSERT ON public.trip_passengers
  FOR EACH ROW EXECUTE FUNCTION public.check_trip_capacity();

-- ============ NOTIFICATIONS ============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON public.notifications(user_id, read, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Authenticated can create notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);

-- Auto-notify when admin (or anyone else) adds another user to a trip
CREATE OR REPLACE FUNCTION public.notify_passenger_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trip_info RECORD;
  adder_name TEXT;
BEGIN
  IF NEW.added_by = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT t.data_saida, d.nome AS dest_nome
  INTO trip_info
  FROM public.trips t
  LEFT JOIN public.destinations d ON d.id = t.destination_id
  WHERE t.id = NEW.trip_id;

  SELECT COALESCE(full_name, email) INTO adder_name
  FROM public.profiles WHERE id = NEW.added_by;

  INSERT INTO public.notifications (user_id, title, message, link)
  VALUES (
    NEW.user_id,
    'Você foi adicionado a uma viagem',
    COALESCE(adder_name, 'Um administrador') || ' adicionou você à viagem para ' ||
      COALESCE(trip_info.dest_nome, 'destino') ||
      ' em ' || to_char(trip_info.data_saida, 'DD/MM/YYYY HH24:MI'),
    '/viagens'
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trip_passengers_notify
  AFTER INSERT ON public.trip_passengers
  FOR EACH ROW EXECUTE FUNCTION public.notify_passenger_added();

-- ============ USER_ROLES: allow admin to manage roles ============
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
