alter table public.budget_categories drop column is_rollup;

alter table public.budget_categories
  add column is_rollup boolean generated always as (
    coalesce(public.extract_finance_account_code(name)::int >= 5000, false)
    and coalesce(public.extract_finance_account_code(name) ~ '00$', false)
    and public.extract_finance_account_code(name) <> '4501'
  ) stored;