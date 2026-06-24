-- Create secure RPC functions for quick login and profile update

-- Create or replace function to get or create a profile by email
CREATE OR REPLACE FUNCTION public.get_or_create_profile_by_email(_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  _id uuid;
BEGIN
  SELECT id INTO _id FROM public.profiles WHERE email = _email LIMIT 1;
  IF _id IS NOT NULL THEN
    RETURN _id;
  END IF;

  INSERT INTO public.profiles (id, email, status)
  VALUES (gen_random_uuid(), _email, 'ativo')
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_or_create_profile_by_email(text) TO authenticated;

-- Create or replace function to update a profile by user id
CREATE OR REPLACE FUNCTION public.update_profile_by_user_id(
  _user_id uuid,
  _full_name text,
  _masp text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  UPDATE public.profiles
  SET
    full_name = COALESCE(_full_name, full_name),
    masp = COALESCE(_masp, masp),
    updated_at = now()
  WHERE id = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_profile_by_user_id(uuid, text, text) TO authenticated;
