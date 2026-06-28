ALTER TABLE public.event_sunday_slots DROP CONSTRAINT IF EXISTS event_sunday_slots_channel_check;
ALTER TABLE public.event_sunday_slots ADD CONSTRAINT event_sunday_slots_channel_check
  CHECK (channel = ANY (ARRAY['ministry_highlight'::text, 'announcement_1'::text, 'announcement_2'::text, 'core_value_highlight'::text]));