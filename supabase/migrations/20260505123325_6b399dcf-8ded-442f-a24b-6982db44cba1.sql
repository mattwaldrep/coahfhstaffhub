
-- Calendar enhancements
ALTER TABLE public.calendar_events
  ADD COLUMN all_day boolean NOT NULL DEFAULT false,
  ADD COLUMN category text,
  ADD COLUMN pco_registration boolean NOT NULL DEFAULT false,
  ADD COLUMN rrule text,
  ADD COLUMN recurrence_end_date date,
  ADD COLUMN excluded_dates date[] NOT NULL DEFAULT '{}';

-- Per-event checklist
CREATE TABLE public.event_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  label text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_checklist_event ON public.event_checklist_items(event_id);

ALTER TABLE public.event_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view checklist"
  ON public.event_checklist_items FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Core can manage checklist"
  ON public.event_checklist_items FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'core'::app_role))
  WITH CHECK (has_role(auth.uid(), 'core'::app_role));

CREATE TRIGGER set_updated_at_event_checklist
  BEFORE UPDATE ON public.event_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
