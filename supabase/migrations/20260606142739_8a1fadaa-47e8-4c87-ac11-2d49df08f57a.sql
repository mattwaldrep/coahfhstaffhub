CREATE TABLE public.pco_touchpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pco_person_id text NOT NULL,
  person_name text,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('text','call','email','in_person','other')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pco_touchpoints_person_idx ON public.pco_touchpoints (pco_person_id, created_at DESC);
CREATE INDEX pco_touchpoints_user_idx ON public.pco_touchpoints (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pco_touchpoints TO authenticated;
GRANT ALL ON public.pco_touchpoints TO service_role;

ALTER TABLE public.pco_touchpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Elders and candidates can view touchpoints"
  ON public.pco_touchpoints FOR SELECT TO authenticated
  USING (public.has_any_elder_access(auth.uid()));

CREATE POLICY "Elders and candidates can insert their own touchpoints"
  ON public.pco_touchpoints FOR INSERT TO authenticated
  WITH CHECK (public.has_any_elder_access(auth.uid()) AND user_id = auth.uid());

CREATE POLICY "Authors can delete their own touchpoints"
  ON public.pco_touchpoints FOR DELETE TO authenticated
  USING (user_id = auth.uid());
