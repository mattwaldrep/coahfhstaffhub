
-- 1) serve_leader_touchpoints: replace hardcoded UUID with role-based check
DROP POLICY IF EXISTS "Owner can view their touchpoints" ON public.serve_leader_touchpoints;
DROP POLICY IF EXISTS "Owner can insert their touchpoints" ON public.serve_leader_touchpoints;
DROP POLICY IF EXISTS "Owner can update their touchpoints" ON public.serve_leader_touchpoints;
DROP POLICY IF EXISTS "Owner can delete their touchpoints" ON public.serve_leader_touchpoints;

CREATE POLICY "Serve leader admins view own touchpoints"
  ON public.serve_leader_touchpoints FOR SELECT
  USING (auth.uid() = user_id AND public.is_serve_leader_admin(auth.uid()));

CREATE POLICY "Serve leader admins insert own touchpoints"
  ON public.serve_leader_touchpoints FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.is_serve_leader_admin(auth.uid()));

CREATE POLICY "Serve leader admins update own touchpoints"
  ON public.serve_leader_touchpoints FOR UPDATE
  USING (auth.uid() = user_id AND public.is_serve_leader_admin(auth.uid()))
  WITH CHECK (auth.uid() = user_id AND public.is_serve_leader_admin(auth.uid()));

CREATE POLICY "Serve leader admins delete own touchpoints"
  ON public.serve_leader_touchpoints FOR DELETE
  USING (auth.uid() = user_id AND public.is_serve_leader_admin(auth.uid()));

-- 2) budget_cycles: restrict SELECT to core role
DROP POLICY IF EXISTS "Authenticated can read cycles" ON public.budget_cycles;
CREATE POLICY "Core can read cycles"
  ON public.budget_cycles FOR SELECT
  USING (public.has_role(auth.uid(), 'core'::app_role));

-- 3) elder_meeting_attendees: allow deacons to see attendees (for joint meetings)
DROP POLICY IF EXISTS "elder_attendees_select" ON public.elder_meeting_attendees;
CREATE POLICY "elder_attendees_select"
  ON public.elder_meeting_attendees FOR SELECT
  USING (public.has_any_elder_access(auth.uid()) OR public.has_deacon_access(auth.uid()));
