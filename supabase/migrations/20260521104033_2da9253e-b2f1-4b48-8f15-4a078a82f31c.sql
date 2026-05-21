
ALTER TABLE public.mission_trips
  ADD COLUMN IF NOT EXISTS inquiry_token uuid UNIQUE DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS alternate_dates text,
  ADD COLUMN IF NOT EXISTS vision text,
  ADD COLUMN IF NOT EXISTS church_context text,
  ADD COLUMN IF NOT EXISTS inquiry_submitted_at timestamptz;

UPDATE public.mission_trips SET inquiry_token = gen_random_uuid() WHERE inquiry_token IS NULL;

ALTER TABLE public.mission_trips ALTER COLUMN inquiry_token SET NOT NULL;
