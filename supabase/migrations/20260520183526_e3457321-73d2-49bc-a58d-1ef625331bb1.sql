
ALTER TABLE public.class_series
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS freq text NOT NULL DEFAULT 'WEEKLY',
  ADD COLUMN IF NOT EXISTS interval integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS byweekday text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS bysetpos integer,
  ADD COLUMN IF NOT EXISTS excluded_dates date[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS calendar_event_id uuid;

-- Backfill start_date for any existing series so the linked event has a DTSTART.
UPDATE public.class_series
SET start_date = CURRENT_DATE
WHERE start_date IS NULL;

-- Backfill byweekday from the legacy single-weekday column when empty.
UPDATE public.class_series
SET byweekday = ARRAY[(ARRAY['SU','MO','TU','WE','TH','FR','SA'])[weekday + 1]]
WHERE array_length(byweekday, 1) IS NULL;
