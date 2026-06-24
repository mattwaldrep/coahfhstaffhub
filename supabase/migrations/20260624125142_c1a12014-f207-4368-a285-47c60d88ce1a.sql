-- Add day-of plan rich text to events
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS day_of_plan TEXT;

-- Reusable day-of plan templates
CREATE TABLE IF NOT EXISTS public.event_plan_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_plan_templates TO authenticated;
GRANT ALL ON public.event_plan_templates TO service_role;

ALTER TABLE public.event_plan_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read plan templates"
  ON public.event_plan_templates FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create plan templates"
  ON public.event_plan_templates FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update plan templates"
  ON public.event_plan_templates FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Creators or core can delete plan templates"
  ON public.event_plan_templates FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'core'));

CREATE TRIGGER set_event_plan_templates_updated_at
  BEFORE UPDATE ON public.event_plan_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();