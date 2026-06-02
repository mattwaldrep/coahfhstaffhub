DROP POLICY IF EXISTS "Authenticated view workflows" ON public.onboarding_workflows;
DROP POLICY IF EXISTS "Authenticated view tasks" ON public.onboarding_tasks;

CREATE POLICY "Core can view workflows"
  ON public.onboarding_workflows
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'core'::app_role));

CREATE POLICY "Core can view tasks"
  ON public.onboarding_tasks
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'core'::app_role));