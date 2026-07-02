
-- Add revision_requested to enums
ALTER TYPE ministry_plan_status ADD VALUE IF NOT EXISTS 'revision_requested';
ALTER TYPE plan_submission_status ADD VALUE IF NOT EXISTS 'revision_requested';

-- New table for plan cycle tracking
CREATE TABLE public.ministry_plan_cycles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fiscal_year INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('setup','open','review','revision','complete')),
  opens_at DATE,
  submissions_due_at DATE,
  feedback_due_at DATE,
  closes_at DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ministry_plan_cycles TO authenticated;
GRANT ALL ON public.ministry_plan_cycles TO service_role;

ALTER TABLE public.ministry_plan_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view plan cycles"
  ON public.ministry_plan_cycles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Core can manage plan cycles"
  ON public.ministry_plan_cycles FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'core'::app_role))
  WITH CHECK (has_role(auth.uid(), 'core'::app_role));

CREATE TRIGGER ministry_plan_cycles_updated_at
  BEFORE UPDATE ON public.ministry_plan_cycles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Cycle linkage on MAP rows
ALTER TABLE public.ministry_action_plans
  ADD COLUMN IF NOT EXISTS cycle_id UUID REFERENCES public.ministry_plan_cycles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fiscal_year INTEGER;

CREATE INDEX IF NOT EXISTS ministry_action_plans_cycle_id_idx ON public.ministry_action_plans(cycle_id);
CREATE INDEX IF NOT EXISTS ministry_action_plans_fiscal_year_idx ON public.ministry_action_plans(fiscal_year);
