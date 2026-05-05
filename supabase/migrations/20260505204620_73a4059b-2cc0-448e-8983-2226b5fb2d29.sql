
-- Drop legacy pastoral care tables
DROP TABLE IF EXISTS public.pastoral_care_updates CASCADE;
DROP TABLE IF EXISTS public.pastoral_care_entries CASCADE;

-- PCO config (single-row by convention)
CREATE TABLE public.elder_pco_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id text,
  assigned_elder_field_id text,
  spiritual_health_field_id text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.elder_pco_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY pco_config_select ON public.elder_pco_config
  FOR SELECT TO authenticated
  USING (has_any_elder_access(auth.uid()));

CREATE POLICY pco_config_modify ON public.elder_pco_config
  FOR ALL TO authenticated
  USING (is_full_elder(auth.uid()))
  WITH CHECK (is_full_elder(auth.uid()));

-- Notes thread keyed by PCO person id
CREATE TABLE public.pco_pastoral_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pco_person_id text NOT NULL,
  body text NOT NULL,
  author_id uuid,
  executive_session boolean NOT NULL DEFAULT false,
  meeting_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pco_pastoral_notes_person ON public.pco_pastoral_notes(pco_person_id);
CREATE INDEX idx_pco_pastoral_notes_meeting ON public.pco_pastoral_notes(meeting_id);

ALTER TABLE public.pco_pastoral_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY pco_notes_select ON public.pco_pastoral_notes
  FOR SELECT TO authenticated
  USING (has_any_elder_access(auth.uid()) AND ((NOT executive_session) OR is_full_elder(auth.uid())));

CREATE POLICY pco_notes_modify ON public.pco_pastoral_notes
  FOR ALL TO authenticated
  USING (has_any_elder_access(auth.uid()) AND ((NOT executive_session) OR is_full_elder(auth.uid())))
  WITH CHECK (has_any_elder_access(auth.uid()) AND ((NOT executive_session) OR is_full_elder(auth.uid())));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.pco_pastoral_notes;
