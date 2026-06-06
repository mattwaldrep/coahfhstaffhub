
DROP POLICY IF EXISTS "authenticated_realtime_select" ON realtime.messages;
DROP POLICY IF EXISTS "authenticated_realtime_insert" ON realtime.messages;

CREATE POLICY "authenticated_realtime_select" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    CASE
      WHEN (realtime.topic() LIKE 'elder-%' OR realtime.topic() LIKE 'pco-%')
        THEN public.has_any_elder_access((SELECT auth.uid()))
      ELSE public.has_any_role(
        (SELECT auth.uid()),
        ARRAY['core','meeting','extended','elder','elder_candidate']::public.app_role[]
      )
    END
  );

CREATE POLICY "authenticated_realtime_insert" ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    CASE
      WHEN (realtime.topic() LIKE 'elder-%' OR realtime.topic() LIKE 'pco-%')
        THEN public.has_any_elder_access((SELECT auth.uid()))
      ELSE public.has_any_role(
        (SELECT auth.uid()),
        ARRAY['core','meeting','extended','elder','elder_candidate']::public.app_role[]
      )
    END
  );
