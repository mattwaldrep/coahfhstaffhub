
-- elder_threshold_notifications: explicit deny-all for client roles, server-only access
REVOKE ALL ON public.elder_threshold_notifications FROM anon, authenticated;
GRANT ALL ON public.elder_threshold_notifications TO service_role;
CREATE POLICY "Deny all client access" ON public.elder_threshold_notifications
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- oauth_states: server-only
REVOKE ALL ON public.oauth_states FROM anon, authenticated;
GRANT ALL ON public.oauth_states TO service_role;
CREATE POLICY "Deny all client access" ON public.oauth_states
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- onboarding_task_comments: restrict policies to authenticated role (not public)
DROP POLICY IF EXISTS "Author can delete own onboarding comments" ON public.onboarding_task_comments;
DROP POLICY IF EXISTS "Core can add onboarding comments" ON public.onboarding_task_comments;
DROP POLICY IF EXISTS "Core can view onboarding comments" ON public.onboarding_task_comments;

CREATE POLICY "Author can delete own onboarding comments"
  ON public.onboarding_task_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid());
CREATE POLICY "Core can add onboarding comments"
  ON public.onboarding_task_comments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'core'::app_role) AND author_id = auth.uid());
CREATE POLICY "Core can view onboarding comments"
  ON public.onboarding_task_comments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'core'::app_role));

-- user_roles: add restrictive policy preventing self-escalation; only core (and service_role) can write.
CREATE POLICY "Block self role changes"
  ON public.user_roles AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'core'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'core'::app_role) AND user_id <> auth.uid());
