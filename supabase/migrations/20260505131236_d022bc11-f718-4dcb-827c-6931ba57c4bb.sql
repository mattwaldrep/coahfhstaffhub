-- Budget categories
CREATE TABLE public.budget_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  fiscal_year INT NOT NULL,
  annual_budget NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fiscal_year, name)
);
ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Core can manage budget categories" ON public.budget_categories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'core'))
  WITH CHECK (public.has_role(auth.uid(), 'core'));
CREATE TRIGGER trg_budget_categories_updated BEFORE UPDATE ON public.budget_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Monthly actuals
CREATE TABLE public.budget_actuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.budget_categories(id) ON DELETE CASCADE,
  fiscal_year INT NOT NULL,
  month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_id, fiscal_year, month)
);
ALTER TABLE public.budget_actuals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Core can manage budget actuals" ON public.budget_actuals
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'core'))
  WITH CHECK (public.has_role(auth.uid(), 'core'));
CREATE TRIGGER trg_budget_actuals_updated BEFORE UPDATE ON public.budget_actuals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Monthly report file references
CREATE TABLE public.finance_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year INT NOT NULL,
  month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  label TEXT,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.finance_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Core can manage finance reports" ON public.finance_reports
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'core'))
  WITH CHECK (public.has_role(auth.uid(), 'core'));

-- Private storage bucket for the report files
INSERT INTO storage.buckets (id, name, public)
VALUES ('finance-reports', 'finance-reports', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Core can read finance report files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'finance-reports' AND public.has_role(auth.uid(), 'core'));
CREATE POLICY "Core can upload finance report files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'finance-reports' AND public.has_role(auth.uid(), 'core'));
CREATE POLICY "Core can update finance report files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'finance-reports' AND public.has_role(auth.uid(), 'core'));
CREATE POLICY "Core can delete finance report files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'finance-reports' AND public.has_role(auth.uid(), 'core'));