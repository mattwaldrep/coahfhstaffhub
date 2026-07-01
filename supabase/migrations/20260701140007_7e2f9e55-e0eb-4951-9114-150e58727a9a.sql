
CREATE TABLE public.serve_leader_touchpoints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pco_person_id TEXT NOT NULL,
  person_name TEXT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('text','call','email','in_person','other')),
  direction TEXT CHECK (direction IN ('outbound','inbound')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX serve_leader_touchpoints_person_idx ON public.serve_leader_touchpoints (pco_person_id, created_at DESC);
CREATE INDEX serve_leader_touchpoints_user_idx ON public.serve_leader_touchpoints (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.serve_leader_touchpoints TO authenticated;
GRANT ALL ON public.serve_leader_touchpoints TO service_role;

ALTER TABLE public.serve_leader_touchpoints ENABLE ROW LEVEL SECURITY;

-- Only the owner (Matt Waldrep) manages his own serve leader touchpoints.
CREATE POLICY "Owner can view their touchpoints"
  ON public.serve_leader_touchpoints FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND auth.uid() = '3a7c1973-5fc6-4f2f-a129-31713fd24587'::uuid);

CREATE POLICY "Owner can insert their touchpoints"
  ON public.serve_leader_touchpoints FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND auth.uid() = '3a7c1973-5fc6-4f2f-a129-31713fd24587'::uuid);

CREATE POLICY "Owner can update their touchpoints"
  ON public.serve_leader_touchpoints FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND auth.uid() = '3a7c1973-5fc6-4f2f-a129-31713fd24587'::uuid)
  WITH CHECK (auth.uid() = user_id AND auth.uid() = '3a7c1973-5fc6-4f2f-a129-31713fd24587'::uuid);

CREATE POLICY "Owner can delete their touchpoints"
  ON public.serve_leader_touchpoints FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id AND auth.uid() = '3a7c1973-5fc6-4f2f-a129-31713fd24587'::uuid);

CREATE TRIGGER set_updated_at_serve_leader_touchpoints
  BEFORE UPDATE ON public.serve_leader_touchpoints
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
