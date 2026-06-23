ALTER TABLE public.mission_trips
  ADD COLUMN IF NOT EXISTS skipped_steps jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS step_notes jsonb NOT NULL DEFAULT '{}'::jsonb;