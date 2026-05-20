ALTER TABLE public.budget_categories
  ADD COLUMN classification text NOT NULL DEFAULT 'operating_expense';

ALTER TABLE public.budget_categories
  ADD CONSTRAINT budget_categories_classification_check
  CHECK (classification IN ('operating_income','bridge_income','operating_expense','designated_expense'));

-- Backfill from name + kind
UPDATE public.budget_categories
SET classification = CASE
  WHEN name ~* '^\s*4501' THEN 'bridge_income'
  WHEN kind = 'income' THEN 'operating_income'
  WHEN name ~* '^\s*9500' OR name ~* 'CP Expense' OR name ~* 'Designated Expense' THEN 'designated_expense'
  ELSE 'operating_expense'
END;