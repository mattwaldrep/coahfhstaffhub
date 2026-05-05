
CREATE TABLE public.agenda_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL,
  title text NOT NULL,
  notes text,
  owner_id uuid,
  owner_name text,
  status text NOT NULL DEFAULT 'open',
  position integer NOT NULL DEFAULT 0,
  source text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agenda_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view agenda items" ON public.agenda_items
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['core'::app_role, 'meeting'::app_role]));

CREATE POLICY "Staff can manage agenda items" ON public.agenda_items
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['core'::app_role, 'meeting'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['core'::app_role, 'meeting'::app_role]));

CREATE TRIGGER agenda_items_updated_at BEFORE UPDATE ON public.agenda_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_agenda_items_meeting ON public.agenda_items(meeting_id, position);

-- Realtime
ALTER TABLE public.meetings REPLICA IDENTITY FULL;
ALTER TABLE public.agenda_items REPLICA IDENTITY FULL;
ALTER TABLE public.action_items REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agenda_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.action_items;
