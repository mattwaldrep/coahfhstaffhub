CREATE POLICY "Meeting staff manage sunday slots" ON public.event_sunday_slots FOR ALL TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['core','meeting']::app_role[]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['core','meeting']::app_role[]));