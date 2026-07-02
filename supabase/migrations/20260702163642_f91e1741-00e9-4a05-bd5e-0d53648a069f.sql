
DROP POLICY IF EXISTS "Staff reads submitted submissions" ON public.calendar_plan_submissions;
CREATE POLICY "Staff reads submitted submissions"
ON public.calendar_plan_submissions
FOR SELECT
TO authenticated
USING (
  status <> 'draft'::plan_submission_status
  AND public.has_any_role(auth.uid(), ARRAY['core','meeting','elder','elder_candidate','deacon','chair_of_deacons','cg_coach']::app_role[])
);

DROP POLICY IF EXISTS "Staff reads submitted proposed events" ON public.calendar_proposed_events;
CREATE POLICY "Staff reads submitted proposed events"
ON public.calendar_proposed_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.calendar_plan_submissions s
    WHERE s.id = calendar_proposed_events.submission_id
      AND s.status <> 'draft'::plan_submission_status
  )
  AND public.has_any_role(auth.uid(), ARRAY['core','meeting','elder','elder_candidate','deacon','chair_of_deacons','cg_coach']::app_role[])
);
