CREATE TABLE public.pco_calendar_workspaces (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 instance_id text NOT NULL UNIQUE,
 event_id text NOT NULL,
 name text NOT NULL,
 starts_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pco_calendar_workspaces TO authenticated;
GRANT ALL ON public.pco_calendar_workspaces TO service_role;
ALTER TABLE public.pco_calendar_workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read PCO workspaces" ON public.pco_calendar_workspaces FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['core','meeting','extended','calendar_admin','serve_leader_admin']::public.app_role[]));
CREATE TABLE public.pco_calendar_checklist (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.pco_calendar_workspaces(id),
 action_item_id uuid NOT NULL UNIQUE REFERENCES public.action_items(id) ON DELETE CASCADE,
 label text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pco_calendar_checklist TO authenticated;
GRANT ALL ON public.pco_calendar_checklist TO service_role;
ALTER TABLE public.pco_calendar_checklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read PCO checklist" ON public.pco_calendar_checklist FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['core','meeting','extended','calendar_admin','serve_leader_admin']::public.app_role[]));
CREATE TABLE public.pco_calendar_comments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.pco_calendar_workspaces(id),
 author_id uuid NOT NULL,
 body text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pco_calendar_comments TO authenticated;
GRANT ALL ON public.pco_calendar_comments TO service_role;
ALTER TABLE public.pco_calendar_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read PCO comments" ON public.pco_calendar_comments FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['core','meeting','extended','calendar_admin','serve_leader_admin']::public.app_role[]));
ALTER TABLE public.action_items ADD COLUMN pco_workspace_id uuid REFERENCES public.pco_calendar_workspaces(id);
CREATE INDEX pco_checklist_workspace_idx ON public.pco_calendar_checklist(workspace_id);
CREATE INDEX pco_comments_workspace_idx ON public.pco_calendar_comments(workspace_id, created_at);
CREATE INDEX action_items_pco_workspace_idx ON public.action_items(pco_workspace_id);
CREATE FUNCTION public.create_pco_checklist_task(_workspace_id uuid, _label text, _title text, _notes text, _assignee_id uuid, _due_date date, _created_by uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE task_id uuid;
BEGIN
 INSERT INTO public.action_items(title,notes,assignee_id,due_date,created_by,pco_workspace_id) VALUES (_title,_notes,_assignee_id,_due_date,_created_by,_workspace_id) RETURNING id INTO task_id;
 INSERT INTO public.pco_calendar_checklist(workspace_id,action_item_id,label) VALUES (_workspace_id,task_id,_label);
 RETURN task_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_pco_checklist_task(uuid,text,text,text,uuid,date,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_pco_checklist_task(uuid,text,text,text,uuid,date,uuid) TO service_role;