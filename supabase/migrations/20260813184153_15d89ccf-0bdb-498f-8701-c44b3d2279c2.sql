DROP POLICY "Staff can view trips" ON public.mission_trips;
CREATE POLICY "Staff can view trips" ON public.mission_trips FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['core'::app_role, 'meeting'::app_role]));