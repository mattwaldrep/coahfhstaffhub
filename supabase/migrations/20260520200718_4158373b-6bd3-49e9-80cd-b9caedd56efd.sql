
UPDATE public.budget_categories
SET classification = 'designated_expense'
WHERE kind = 'expense'
  AND account_code IS NOT NULL
  AND account_code ~ '^[0-9]+$'
  AND account_code::int >= 9000
  AND classification <> 'designated_expense';
