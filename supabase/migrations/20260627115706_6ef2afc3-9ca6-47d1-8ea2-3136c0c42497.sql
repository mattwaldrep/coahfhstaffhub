ALTER TABLE public.pco_touchpoints
  ADD COLUMN IF NOT EXISTS direction text
  CHECK (direction IN ('outbound', 'inbound') OR direction IS NULL);
CREATE INDEX IF NOT EXISTS pco_touchpoints_person_kind_created_idx
  ON public.pco_touchpoints (pco_person_id, kind, created_at DESC);