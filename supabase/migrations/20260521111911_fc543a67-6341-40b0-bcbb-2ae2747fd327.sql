ALTER TABLE public.mission_trips
  ADD COLUMN IF NOT EXISTS coordinator_on_call_name text,
  ADD COLUMN IF NOT EXISTS coordinator_on_call_phone text,
  ADD COLUMN IF NOT EXISTS confirm_checklist jsonb NOT NULL DEFAULT '{}'::jsonb;