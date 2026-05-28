CREATE TABLE public.event_sunday_slots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('ministry_highlight','sunday_announcement')),
  sunday_date date NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (event_id, channel, sunday_date)
);

CREATE INDEX idx_event_sunday_slots_date_channel ON public.event_sunday_slots(sunday_date, channel);
CREATE INDEX idx_event_sunday_slots_event ON public.event_sunday_slots(event_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_sunday_slots TO authenticated;
GRANT ALL ON public.event_sunday_slots TO service_role;

ALTER TABLE public.event_sunday_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view sunday slots"
  ON public.event_sunday_slots FOR SELECT TO authenticated USING (true);

CREATE POLICY "Core can manage sunday slots"
  ON public.event_sunday_slots FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'core'::app_role))
  WITH CHECK (has_role(auth.uid(), 'core'::app_role));