
-- Restrict profile visibility: users see own profile; broader visibility requires a leadership/staff-plus role.
DROP POLICY IF EXISTS "Authenticated can view profiles" ON public.profiles;

CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Staff and leadership can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_any_role(
    auth.uid(),
    ARRAY['core','meeting','elder','elder_candidate','deacon','chair_of_deacons','cg_coach']::app_role[]
  )
);

-- Harden user_roles: add RESTRICTIVE UPDATE/DELETE policies mirroring the INSERT restriction.
CREATE POLICY "Only core can update roles"
ON public.user_roles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'core'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'core'::app_role));

CREATE POLICY "Only core can delete roles"
ON public.user_roles
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'core'::app_role));
