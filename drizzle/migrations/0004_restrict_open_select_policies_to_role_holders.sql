CREATE OR REPLACE FUNCTION public.has_any_app_role(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('event_checklist_items','Authenticated can view checklist'),
    ('event_template_attachments','Authenticated can view attachments'),
    ('event_template_item_state','Authenticated can view item state'),
    ('onboarding_templates','Authenticated view templates'),
    ('event_comments','Authenticated can view event comments'),
    ('calendar_event_categories','Authenticated can read categories'),
    ('ministry_plan_cycles','Authenticated can view plan cycles')
  ) AS t(tbl, pol)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.pol, r.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_any_app_role(auth.uid()))', 'Staff can view', r.tbl);
  END LOOP;
END $$;