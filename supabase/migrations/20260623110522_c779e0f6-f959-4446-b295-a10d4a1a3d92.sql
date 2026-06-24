
-- DRIVERS: column-level grants + admin-only writes; CNH visible only via admin RPC
DROP POLICY IF EXISTS "auth view drivers" ON public.drivers;
DROP POLICY IF EXISTS "auth insert drivers" ON public.drivers;
DROP POLICY IF EXISTS "auth update drivers" ON public.drivers;
DROP POLICY IF EXISTS "auth delete drivers" ON public.drivers;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.drivers FROM authenticated;
GRANT SELECT (id, nome, telefone, created_at, updated_at) ON public.drivers TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.drivers TO authenticated;
GRANT ALL ON public.drivers TO service_role;

CREATE POLICY "anyone authenticated can view drivers (non-sensitive cols)"
  ON public.drivers FOR SELECT TO authenticated USING (true);
CREATE POLICY "only admins can insert drivers"
  ON public.drivers FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "only admins can update drivers"
  ON public.drivers FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "only admins can delete drivers"
  ON public.drivers FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Admin RPC to read drivers including CNH
CREATE OR REPLACE FUNCTION public.list_drivers_admin()
RETURNS SETOF public.drivers
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem ler dados sensíveis de motoristas';
  END IF;
  RETURN QUERY SELECT * FROM public.drivers ORDER BY nome;
END;
$$;
GRANT EXECUTE ON FUNCTION public.list_drivers_admin() TO authenticated;

-- PROFILES: hide email/masp from other users; nome stays visible
DROP POLICY IF EXISTS "Authenticated can view profiles" ON public.profiles;

REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, full_name, status) ON public.profiles TO authenticated;

CREATE POLICY "users see profiles (col-grants restrict sensitive)"
  ON public.profiles FOR SELECT TO authenticated USING (true);

-- Admin RPC to list profiles with full info (for passenger picker + admin panel)
CREATE OR REPLACE FUNCTION public.list_profiles_admin()
RETURNS TABLE (id uuid, full_name text, email text, masp text, status text, is_admin boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem listar dados completos de usuários';
  END IF;
  RETURN QUERY
    SELECT p.id, p.full_name, p.email, p.masp, p.status,
           EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin')
    FROM public.profiles p
    ORDER BY p.full_name;
END;
$$;
GRANT EXECUTE ON FUNCTION public.list_profiles_admin() TO authenticated;

-- Allow users to read their own full profile (email/masp included)
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (id uuid, full_name text, email text, masp text, status text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT p.id, p.full_name, p.email, p.masp, p.status
    FROM public.profiles p WHERE p.id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
