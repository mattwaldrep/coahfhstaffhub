ALTER TABLE public.sunday_reviews
  ADD COLUMN IF NOT EXISTS god_at_work TEXT,
  ADD COLUMN IF NOT EXISTS thank_this_week TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_needed TEXT;