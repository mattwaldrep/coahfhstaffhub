
CREATE OR REPLACE FUNCTION public.is_staff_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('core','meeting','elder','elder_candidate','deacon','chair_of_deacons','cg_coach','serve_leader_admin')
  )
$$;

DROP POLICY IF EXISTS "Authenticated can view events" ON public.calendar_events;
CREATE POLICY "Staff can view events" ON public.calendar_events
FOR SELECT TO authenticated
USING (public.is_staff_member(auth.uid()) OR public.can_edit_sub_calendar(auth.uid(), sub_calendar));

DROP POLICY IF EXISTS "Authenticated can view cycles" ON public.calendar_planning_cycles;
CREATE POLICY "Staff can view cycles" ON public.calendar_planning_cycles
FOR SELECT TO authenticated USING (public.is_staff_member(auth.uid()));

DROP POLICY IF EXISTS "Authenticated read sub-calendars" ON public.calendar_sub_calendars;
CREATE POLICY "Staff read sub-calendars" ON public.calendar_sub_calendars
FOR SELECT TO authenticated USING (public.is_staff_member(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can view template items" ON public.checklist_template_items;
CREATE POLICY "Staff can view template items" ON public.checklist_template_items
FOR SELECT TO authenticated USING (public.is_staff_member(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can view templates" ON public.checklist_templates;
CREATE POLICY "Staff can view templates" ON public.checklist_templates
FOR SELECT TO authenticated USING (public.is_staff_member(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can view class series" ON public.class_series;
CREATE POLICY "Staff can view class series" ON public.class_series
FOR SELECT TO authenticated USING (public.is_staff_member(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can read comms managers" ON public.comms_channel_managers;
CREATE POLICY "Staff can read comms managers" ON public.comms_channel_managers
FOR SELECT TO authenticated USING (public.is_staff_member(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read plan templates" ON public.event_plan_templates;
CREATE POLICY "Staff can read plan templates" ON public.event_plan_templates
FOR SELECT TO authenticated
USING (public.is_staff_member(auth.uid()) OR created_by = auth.uid());

DROP POLICY IF EXISTS "Authenticated can view event rooms" ON public.event_rooms;
CREATE POLICY "Staff can view event rooms" ON public.event_rooms
FOR SELECT TO authenticated USING (public.is_staff_member(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can view sunday slots" ON public.event_sunday_slots;
CREATE POLICY "Staff can view sunday slots" ON public.event_sunday_slots
FOR SELECT TO authenticated USING (public.is_staff_member(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can read pco services config" ON public.pco_services_config;
CREATE POLICY "Staff can read pco services config" ON public.pco_services_config
FOR SELECT TO authenticated USING (public.is_staff_member(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can view rooms" ON public.rooms;
CREATE POLICY "Staff can view rooms" ON public.rooms
FOR SELECT TO authenticated USING (public.is_staff_member(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can view nudges" ON public.sunday_review_nudges;
CREATE POLICY "Staff can view nudges" ON public.sunday_review_nudges
FOR SELECT TO authenticated USING (public.is_staff_member(auth.uid()));
