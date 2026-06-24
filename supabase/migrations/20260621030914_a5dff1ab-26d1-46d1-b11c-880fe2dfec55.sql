
-- Add MASP and status to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS masp TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ativo';

-- MASP format: exactly 8 digits
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_masp_format;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_masp_format CHECK (masp IS NULL OR masp ~ '^[0-9]{8}$');

-- Unique MASP (allows multiple NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_masp_unique ON public.profiles(masp) WHERE masp IS NOT NULL;

-- Status check
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check CHECK (status IN ('ativo','bloqueado'));

-- Update handle_new_user to capture masp from raw_user_meta_data and require it
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_count INT;
  v_masp TEXT;
BEGIN
  v_masp := NULLIF(NEW.raw_user_meta_data->>'masp', '');

  IF v_masp IS NULL OR v_masp !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION 'MASP é obrigatório e deve conter 8 dígitos numéricos';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE masp = v_masp) THEN
    RAISE EXCEPTION 'MASP já cadastrado: %', v_masp;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, masp, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
    v_masp,
    'ativo'
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
$function$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Allow admins to update any profile (for setting status / masp)
DROP POLICY IF EXISTS "admins can update profiles" ON public.profiles;
CREATE POLICY "admins can update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Block trip_passengers inserts/operations for blocked users (defensive; UI also enforces)
CREATE OR REPLACE FUNCTION public.block_inactive_passenger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  s TEXT;
BEGIN
  SELECT status INTO s FROM public.profiles WHERE id = NEW.user_id;
  IF s = 'bloqueado' THEN
    RAISE EXCEPTION 'Usuário bloqueado não pode ser adicionado a viagens';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trip_passengers_block_inactive ON public.trip_passengers;
CREATE TRIGGER trip_passengers_block_inactive
  BEFORE INSERT ON public.trip_passengers
  FOR EACH ROW EXECUTE FUNCTION public.block_inactive_passenger();

-- Security fix: restrict trips UPDATE to creator or admin
DROP POLICY IF EXISTS "authenticated can update trips" ON public.trips;
DROP POLICY IF EXISTS "owner or admin update trips" ON public.trips;
CREATE POLICY "owner or admin update trips" ON public.trips
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));
