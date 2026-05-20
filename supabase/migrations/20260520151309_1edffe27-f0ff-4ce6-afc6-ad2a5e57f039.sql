alter table public.finance_reports
  add column if not exists imported_at timestamptz,
  add column if not exists imported_by uuid;

-- Deduplicate any existing rows for the same (category_id, fiscal_year, month) by keeping the most recently updated, summing nothing — we expect at most one per cell already.
delete from public.budget_actuals a
using public.budget_actuals b
where a.category_id = b.category_id
  and a.fiscal_year = b.fiscal_year
  and a.month = b.month
  and a.updated_at < b.updated_at;

create unique index if not exists budget_actuals_unique_cell
  on public.budget_actuals (category_id, fiscal_year, month);