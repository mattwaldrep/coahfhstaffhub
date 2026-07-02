
-- ============================================================
-- Annual Budget Workflow
-- ============================================================

-- 1) Ministry leader assignments (canonical list of "who submits for what")
CREATE TABLE public.ministry_leader_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ministry_area TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, ministry_area)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ministry_leader_assignments TO authenticated;
GRANT ALL ON public.ministry_leader_assignments TO service_role;

ALTER TABLE public.ministry_leader_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leaders can see their own assignments"
  ON public.ministry_leader_assignments FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'core'));

CREATE POLICY "Core manages assignments"
  ON public.ministry_leader_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'core'))
  WITH CHECK (public.has_role(auth.uid(), 'core'));

CREATE TRIGGER trg_mla_updated_at BEFORE UPDATE ON public.ministry_leader_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- 2) Budget cycles (one per fiscal year)
CREATE TABLE public.budget_cycles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fiscal_year INT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'setup'
    CHECK (status IN ('setup','rough_planning','sheet_submission','feedback','complete')),
  rough_due_date DATE,
  sheet_link_target_date DATE,
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.budget_cycles TO authenticated;
GRANT ALL ON public.budget_cycles TO service_role;

ALTER TABLE public.budget_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read cycles"
  ON public.budget_cycles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Core manages cycles"
  ON public.budget_cycles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'core'))
  WITH CHECK (public.has_role(auth.uid(), 'core'));

CREATE TRIGGER trg_bc_updated_at BEFORE UPDATE ON public.budget_cycles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- 3) Ministry budget submissions (one per leader per cycle)
CREATE TABLE public.ministry_budget_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cycle_id UUID NOT NULL REFERENCES public.budget_cycles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ministry_area TEXT NOT NULL,
  spending_report_uploaded_at TIMESTAMPTZ,
  spending_report_path TEXT,
  rough_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (rough_status IN ('not_started','in_progress','submitted')),
  rough_submitted_at TIMESTAMPTZ,
  sheet_url TEXT,
  sheet_status TEXT NOT NULL DEFAULT 'awaiting_link'
    CHECK (sheet_status IN ('awaiting_link','in_progress','submitted','feedback_provided','revised')),
  sheet_submitted_at TIMESTAMPTZ,
  feedback_body TEXT,
  feedback_submitted_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, user_id, ministry_area)
);

CREATE INDEX idx_mbs_user ON public.ministry_budget_submissions(user_id);
CREATE INDEX idx_mbs_cycle ON public.ministry_budget_submissions(cycle_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ministry_budget_submissions TO authenticated;
GRANT ALL ON public.ministry_budget_submissions TO service_role;

ALTER TABLE public.ministry_budget_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leaders read own submissions; core reads all"
  ON public.ministry_budget_submissions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'core'));

CREATE POLICY "Leaders update own submission fields; core updates all"
  ON public.ministry_budget_submissions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'core'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'core'));

CREATE POLICY "Core inserts/deletes submissions"
  ON public.ministry_budget_submissions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'core'));

CREATE POLICY "Core deletes submissions"
  ON public.ministry_budget_submissions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'core'));

CREATE TRIGGER trg_mbs_updated_at BEFORE UPDATE ON public.ministry_budget_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- 4) Rough budget lines
CREATE TABLE public.ministry_rough_budget_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES public.ministry_budget_submissions(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.budget_categories(id) ON DELETE SET NULL,
  category_name TEXT NOT NULL,
  amount_annual NUMERIC(12,2) NOT NULL DEFAULT 0,
  note TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mrbl_submission ON public.ministry_rough_budget_lines(submission_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ministry_rough_budget_lines TO authenticated;
GRANT ALL ON public.ministry_rough_budget_lines TO service_role;

ALTER TABLE public.ministry_rough_budget_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leaders manage lines on own submissions; core all"
  ON public.ministry_rough_budget_lines FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ministry_budget_submissions s
      WHERE s.id = submission_id
        AND (s.user_id = auth.uid() OR public.has_role(auth.uid(), 'core'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ministry_budget_submissions s
      WHERE s.id = submission_id
        AND (s.user_id = auth.uid() OR public.has_role(auth.uid(), 'core'))
    )
  );

CREATE TRIGGER trg_mrbl_updated_at BEFORE UPDATE ON public.ministry_rough_budget_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- 5) 10k-ft ministry high level plans
CREATE TABLE public.ministry_high_level_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES public.ministry_budget_submissions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ministry_area TEXT NOT NULL,
  fiscal_year INT NOT NULL,
  purpose TEXT NOT NULL DEFAULT '',
  top_goals JSONB NOT NULL DEFAULT '[]'::jsonb,
  swot_seeds JSONB NOT NULL DEFAULT
    jsonb_build_object('strengths', '[]'::jsonb, 'weaknesses', '[]'::jsonb,
                       'opportunities', '[]'::jsonb, 'threats', '[]'::jsonb),
  notes TEXT NOT NULL DEFAULT '',
  carried_to_map_id UUID REFERENCES public.ministry_action_plans(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (submission_id)
);

CREATE INDEX idx_mhlp_user_area_fy ON public.ministry_high_level_plans(user_id, ministry_area, fiscal_year);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ministry_high_level_plans TO authenticated;
GRANT ALL ON public.ministry_high_level_plans TO service_role;

ALTER TABLE public.ministry_high_level_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leaders own their 10k-ft plan; core all"
  ON public.ministry_high_level_plans FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'core'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'core'));

CREATE TRIGGER trg_mhlp_updated_at BEFORE UPDATE ON public.ministry_high_level_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
