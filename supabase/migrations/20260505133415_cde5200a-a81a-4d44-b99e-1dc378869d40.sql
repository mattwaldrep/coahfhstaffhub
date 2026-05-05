
CREATE TABLE public.meeting_section_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL,
  section_key text NOT NULL,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, section_key)
);
ALTER TABLE public.meeting_section_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage section notes" ON public.meeting_section_notes
  FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['core'::app_role, 'meeting'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['core'::app_role, 'meeting'::app_role]));
CREATE TRIGGER meeting_section_notes_updated_at
  BEFORE UPDATE ON public.meeting_section_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.meeting_event_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL,
  event_id uuid NOT NULL,
  occurrence_date date NOT NULL,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, event_id, occurrence_date)
);
ALTER TABLE public.meeting_event_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage event notes" ON public.meeting_event_notes
  FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['core'::app_role, 'meeting'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['core'::app_role, 'meeting'::app_role]));
CREATE TRIGGER meeting_event_notes_updated_at
  BEFORE UPDATE ON public.meeting_event_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.finance_reports ADD COLUMN IF NOT EXISTS report_type text NOT NULL DEFAULT 'finance';
CREATE INDEX IF NOT EXISTS idx_finance_reports_type_year_month ON public.finance_reports(report_type, fiscal_year, month);

CREATE INDEX IF NOT EXISTS idx_action_items_open_assignee ON public.action_items(assignee_id) WHERE completed = false;
