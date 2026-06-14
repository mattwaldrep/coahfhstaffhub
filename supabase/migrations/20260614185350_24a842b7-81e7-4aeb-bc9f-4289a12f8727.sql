-- Allow deacons and chair_of_deacons to subscribe to elder-* Realtime topics
-- (for joint deacon/elder meetings). Row-level access is still enforced by
-- the underlying tables' RLS, so this only opens the channel itself.

DROP POLICY IF EXISTS "authenticated_realtime_select" ON realtime.messages;
DROP POLICY IF EXISTS "authenticated_realtime_insert" ON realtime.messages;

CREATE POLICY "authenticated_realtime_select" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    CASE
      WHEN (realtime.topic() LIKE 'elder-%' OR realtime.topic() LIKE 'pco-%')
        THEN public.has_any_role(
          (SELECT auth.uid()),
          ARRAY['elder','elder_candidate','deacon','chair_of_deacons']::public.app_role[]
        )
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
        THEN public.has_any_role(
          (SELECT auth.uid()),
          ARRAY['elder','elder_candidate','deacon','chair_of_deacons']::public.app_role[]
        )
      ELSE public.has_any_role(
        (SELECT auth.uid()),
        ARRAY['core','meeting','extended','elder','elder_candidate']::public.app_role[]
      )
    END
  );
