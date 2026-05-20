create or replace function public.extract_finance_account_code(_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(substring(coalesce(_name, '') from '^\s*(\d{4,6})'), '')
$$;

alter table public.budget_categories
  add column account_code text generated always as (public.extract_finance_account_code(name)) stored,
  add column is_rollup boolean generated always as (
    coalesce(public.extract_finance_account_code(name) ~ '00$', false)
    and public.extract_finance_account_code(name) <> '4501'
  ) stored,
  add column is_below_the_line boolean generated always as (
    classification = 'designated_expense'
    or coalesce(public.extract_finance_account_code(name)::int >= 9000, false)
  ) stored;

create index if not exists idx_budget_categories_fiscal_year_account_code
  on public.budget_categories (fiscal_year, account_code);

create index if not exists idx_budget_categories_fiscal_year_flags
  on public.budget_categories (fiscal_year, is_rollup, is_below_the_line);