
-- 1. OAuth state nonce table
CREATE TABLE IF NOT EXISTS public.oauth_states (
  state TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  provider TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes')
);
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
-- No policies: only service role (server) accesses this table.

-- 2. Mission-trips storage UPDATE policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'mission_trips_update'
  ) THEN
    CREATE POLICY mission_trips_update ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'mission-trips' AND public.has_any_role(auth.uid(), ARRAY['core'::app_role,'meeting'::app_role]))
      WITH CHECK (bucket_id = 'mission-trips' AND public.has_any_role(auth.uid(), ARRAY['core'::app_role,'meeting'::app_role]));
  END IF;
END $$;

-- 3. Realtime channel authorization
-- Restrict elder/pastoral channel topics to elder-tier users.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_realtime_select" ON realtime.messages;
CREATE POLICY "authenticated_realtime_select" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    CASE
      WHEN realtime.topic() LIKE 'elder-%' OR realtime.topic() LIKE 'pco-%'
        THEN public.has_any_elder_access((SELECT auth.uid()))
      ELSE true
    END
  );

DROP POLICY IF EXISTS "authenticated_realtime_insert" ON realtime.messages;
CREATE POLICY "authenticated_realtime_insert" ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    CASE
      WHEN realtime.topic() LIKE 'elder-%' OR realtime.topic() LIKE 'pco-%'
        THEN public.has_any_elder_access((SELECT auth.uid()))
      ELSE true
    END
  );

-- 4. Lock down SECURITY DEFINER helper functions to authenticated role only
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, app_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_elder_access(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_full_elder(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_elder_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_full_elder(uuid) TO authenticated;
