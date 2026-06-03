ALTER TABLE public.event_sunday_slots ALTER COLUMN event_id DROP NOT NULL;
ALTER TABLE public.event_sunday_slots ADD COLUMN IF NOT EXISTS text_label text;
ALTER TABLE public.event_sunday_slots ADD CONSTRAINT event_sunday_slots_label_or_event CHECK (event_id IS NOT NULL OR (text_label IS NOT NULL AND length(btrim(text_label)) > 0));