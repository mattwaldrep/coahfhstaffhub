
CREATE TABLE public.checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view templates" ON public.checklist_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Core can manage templates" ON public.checklist_templates FOR ALL TO authenticated
  USING (has_role(auth.uid(),'core'::app_role)) WITH CHECK (has_role(auth.uid(),'core'::app_role));
CREATE TRIGGER trg_checklist_templates_updated BEFORE UPDATE ON public.checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.checklist_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  label text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cti_template ON public.checklist_template_items(template_id);
ALTER TABLE public.checklist_template_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view template items" ON public.checklist_template_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Core can manage template items" ON public.checklist_template_items FOR ALL TO authenticated
  USING (has_role(auth.uid(),'core'::app_role)) WITH CHECK (has_role(auth.uid(),'core'::app_role));
CREATE TRIGGER trg_cti_updated BEFORE UPDATE ON public.checklist_template_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.event_template_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, template_id)
);
CREATE INDEX idx_eta_event ON public.event_template_attachments(event_id);
ALTER TABLE public.event_template_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view attachments" ON public.event_template_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Core can manage attachments" ON public.event_template_attachments FOR ALL TO authenticated
  USING (has_role(auth.uid(),'core'::app_role)) WITH CHECK (has_role(auth.uid(),'core'::app_role));

CREATE TABLE public.event_template_item_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  template_item_id uuid NOT NULL REFERENCES public.checklist_template_items(id) ON DELETE CASCADE,
  occurrence_date date NOT NULL,
  done boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, template_item_id, occurrence_date)
);
CREATE INDEX idx_etis_event_date ON public.event_template_item_state(event_id, occurrence_date);
ALTER TABLE public.event_template_item_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view item state" ON public.event_template_item_state FOR SELECT TO authenticated USING (true);
CREATE POLICY "Core can manage item state" ON public.event_template_item_state FOR ALL TO authenticated
  USING (has_role(auth.uid(),'core'::app_role)) WITH CHECK (has_role(auth.uid(),'core'::app_role));
CREATE TRIGGER trg_etis_updated BEFORE UPDATE ON public.event_template_item_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
