ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS childcare_needed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS childcare_arranged boolean NOT NULL DEFAULT false;