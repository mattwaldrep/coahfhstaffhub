
CREATE TABLE public.finance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year INTEGER NOT NULL,
  as_of_month SMALLINT NOT NULL CHECK (as_of_month BETWEEN 1 AND 12),
  source_report_id UUID REFERENCES public.finance_reports(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fiscal_year, as_of_month)
);

CREATE TABLE public.finance_snapshot_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES public.finance_snapshots(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.budget_categories(id) ON DELETE CASCADE,
  ytd_actual NUMERIC NOT NULL DEFAULT 0,
  ytd_budget NUMERIC NOT NULL DEFAULT 0,
  annual_budget NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (snapshot_id, category_id)
);

CREATE INDEX idx_finance_snapshot_lines_snapshot ON public.finance_snapshot_lines(snapshot_id);
CREATE INDEX idx_finance_snapshot_lines_category ON public.finance_snapshot_lines(category_id);

ALTER TABLE public.finance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_snapshot_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Core can manage finance snapshots"
  ON public.finance_snapshots FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'core'::app_role))
  WITH CHECK (has_role(auth.uid(), 'core'::app_role));

CREATE POLICY "Core can manage finance snapshot lines"
  ON public.finance_snapshot_lines FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'core'::app_role))
  WITH CHECK (has_role(auth.uid(), 'core'::app_role));

CREATE TRIGGER set_finance_snapshots_updated_at
  BEFORE UPDATE ON public.finance_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
