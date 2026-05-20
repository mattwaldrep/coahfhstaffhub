ALTER TABLE public.budget_categories
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'expense'
    CHECK (kind IN ('income','expense'));