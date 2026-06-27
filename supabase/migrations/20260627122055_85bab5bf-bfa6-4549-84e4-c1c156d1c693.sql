DROP POLICY IF EXISTS "Block self role changes" ON public.user_roles;

CREATE POLICY "Block self role insert"
  ON public.user_roles
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id <> auth.uid());

CREATE POLICY "Block self role update"
  ON public.user_roles
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (user_id <> auth.uid())
  WITH CHECK (user_id <> auth.uid());

CREATE POLICY "Block self role delete"
  ON public.user_roles
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (user_id <> auth.uid());