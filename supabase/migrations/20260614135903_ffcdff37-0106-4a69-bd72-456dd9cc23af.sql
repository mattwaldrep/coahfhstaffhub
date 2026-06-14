
CREATE OR REPLACE FUNCTION public.has_deacon_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('deacon', 'chair_of_deacons')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_chair_of_deacons(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'chair_of_deacons'
  )
$$;

DROP POLICY IF EXISTS elder_meetings_select ON public.elder_meetings;
CREATE POLICY elder_meetings_select ON public.elder_meetings
  FOR SELECT TO authenticated
  USING (
    public.has_any_elder_access(auth.uid())
    OR (public.has_deacon_access(auth.uid()) AND meeting_type = 'joint')
  );

DROP POLICY IF EXISTS elder_joint_select ON public.elder_joint_deacon_items;
CREATE POLICY elder_joint_select ON public.elder_joint_deacon_items
  FOR SELECT TO authenticated
  USING (
    (
      public.has_any_elder_access(auth.uid())
      AND ((NOT executive_session) OR public.is_full_elder(auth.uid()))
    )
    OR (
      public.has_deacon_access(auth.uid())
      AND NOT executive_session
      AND EXISTS (
        SELECT 1 FROM public.elder_meetings m
        WHERE m.id = elder_joint_deacon_items.meeting_id AND m.meeting_type = 'joint'
      )
    )
  );

DROP POLICY IF EXISTS elder_joint_modify ON public.elder_joint_deacon_items;
CREATE POLICY elder_joint_modify ON public.elder_joint_deacon_items
  FOR ALL TO authenticated
  USING (
    (
      public.has_any_elder_access(auth.uid())
      AND ((NOT executive_session) OR public.is_full_elder(auth.uid()))
    )
    OR (
      public.is_chair_of_deacons(auth.uid())
      AND NOT executive_session
      AND EXISTS (
        SELECT 1 FROM public.elder_meetings m
        WHERE m.id = elder_joint_deacon_items.meeting_id AND m.meeting_type = 'joint'
      )
    )
  )
  WITH CHECK (
    (
      public.has_any_elder_access(auth.uid())
      AND ((NOT executive_session) OR public.is_full_elder(auth.uid()))
    )
    OR (
      public.is_chair_of_deacons(auth.uid())
      AND NOT executive_session
      AND EXISTS (
        SELECT 1 FROM public.elder_meetings m
        WHERE m.id = elder_joint_deacon_items.meeting_id AND m.meeting_type = 'joint'
      )
    )
  );
