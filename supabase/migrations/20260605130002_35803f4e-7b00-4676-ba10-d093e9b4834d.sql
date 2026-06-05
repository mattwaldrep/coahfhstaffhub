
-- 1) Backfill event_sunday_slots channel values
-- Drop old check + unique constraints
ALTER TABLE public.event_sunday_slots DROP CONSTRAINT IF EXISTS event_sunday_slots_channel_check;
ALTER TABLE public.event_sunday_slots DROP CONSTRAINT IF EXISTS event_sunday_slots_event_id_channel_sunday_date_key;

-- Map oldest two sunday_announcement rows per sunday to announcement_1 / announcement_2; delete extras
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY sunday_date ORDER BY created_at ASC, id ASC) AS rn
  FROM public.event_sunday_slots
  WHERE channel = 'sunday_announcement'
)
UPDATE public.event_sunday_slots s
SET channel = CASE r.rn WHEN 1 THEN 'announcement_1' WHEN 2 THEN 'announcement_2' END
FROM ranked r
WHERE s.id = r.id AND r.rn <= 2;

DELETE FROM public.event_sunday_slots WHERE channel = 'sunday_announcement';

-- Drop duplicate ministry_highlight rows (keep oldest)
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY sunday_date, channel ORDER BY created_at ASC, id ASC) AS rn
  FROM public.event_sunday_slots
)
DELETE FROM public.event_sunday_slots s
USING ranked r WHERE s.id = r.id AND r.rn > 1;

-- New check constraint and unique constraint (one row per slot)
ALTER TABLE public.event_sunday_slots
  ADD CONSTRAINT event_sunday_slots_channel_check
  CHECK (channel IN ('ministry_highlight','announcement_1','announcement_2'));

ALTER TABLE public.event_sunday_slots
  ADD CONSTRAINT event_sunday_slots_sunday_channel_key UNIQUE (sunday_date, channel);

-- 2) PCO Services config (single-row)
CREATE TABLE public.pco_services_config (
  id boolean PRIMARY KEY DEFAULT true,
  sunday_service_type_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pco_services_config_singleton CHECK (id = true)
);

GRANT SELECT ON public.pco_services_config TO authenticated;
GRANT ALL ON public.pco_services_config TO service_role;

ALTER TABLE public.pco_services_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read pco services config"
  ON public.pco_services_config FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Core can manage pco services config"
  ON public.pco_services_config FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'core'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'core'::app_role));

CREATE TRIGGER pco_services_config_updated_at
  BEFORE UPDATE ON public.pco_services_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.pco_services_config (id, sunday_service_type_id) VALUES (true, NULL)
ON CONFLICT (id) DO NOTHING;
