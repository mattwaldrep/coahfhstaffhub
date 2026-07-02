CREATE OR REPLACE FUNCTION public.is_serve_leader_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'serve_leader_admin'
  )
$$;

INSERT INTO public.user_roles (user_id, role)
VALUES ('3a7c1973-5fc6-4f2f-a129-31713fd24587', 'serve_leader_admin')
ON CONFLICT (user_id, role) DO NOTHING;