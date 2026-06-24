
-- Fix 1 & 3: event_plan_templates UPDATE policy too permissive
DROP POLICY IF EXISTS "Authenticated users can update plan templates" ON public.event_plan_templates;
CREATE POLICY "Creators or core can update plan templates"
ON public.event_plan_templates
FOR UPDATE TO authenticated
USING ((created_by = auth.uid()) OR has_role(auth.uid(), 'core'::app_role))
WITH CHECK ((created_by = auth.uid()) OR has_role(auth.uid(), 'core'::app_role));

-- Fix 5: user_roles - add explicit restrictive INSERT policy preventing self-assignment
CREATE POLICY "Only core can insert roles"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'core'::app_role));

-- Fix 2 & 4: elder_threshold_notifications and oauth_states - ensure no client access
-- Revoke any privileges from anon/authenticated; keep service_role only (server-side use)
REVOKE ALL ON public.elder_threshold_notifications FROM anon, authenticated;
REVOKE ALL ON public.oauth_states FROM anon, authenticated;
GRANT ALL ON public.elder_threshold_notifications TO service_role;
GRANT ALL ON public.oauth_states TO service_role;
