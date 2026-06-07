
CREATE OR REPLACE FUNCTION public.is_cg_coach(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'cg_coach')
$$;

CREATE TABLE public.cg_pco_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_type_id text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cg_pco_config TO authenticated;
GRANT ALL ON public.cg_pco_config TO service_role;
ALTER TABLE public.cg_pco_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cg_config_select" ON public.cg_pco_config FOR SELECT TO authenticated USING (public.is_cg_coach(auth.uid()));
CREATE POLICY "cg_config_modify" ON public.cg_pco_config FOR ALL TO authenticated USING (public.is_cg_coach(auth.uid())) WITH CHECK (public.is_cg_coach(auth.uid()));

CREATE TABLE public.cg_coach_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id text NOT NULL UNIQUE,
  group_name text,
  coach_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cg_coach_assignments TO authenticated;
GRANT ALL ON public.cg_coach_assignments TO service_role;
ALTER TABLE public.cg_coach_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cg_assign_select" ON public.cg_coach_assignments FOR SELECT TO authenticated USING (public.is_cg_coach(auth.uid()));
CREATE POLICY "cg_assign_modify" ON public.cg_coach_assignments FOR ALL TO authenticated USING (public.is_cg_coach(auth.uid())) WITH CHECK (public.is_cg_coach(auth.uid()));

CREATE TABLE public.cg_touchpoints (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id text NOT NULL,
  group_name text,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('text','call','email','in_person','other')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cg_touchpoints_group_idx ON public.cg_touchpoints(group_id, created_at DESC);
CREATE INDEX cg_touchpoints_user_idx ON public.cg_touchpoints(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cg_touchpoints TO authenticated;
GRANT ALL ON public.cg_touchpoints TO service_role;
ALTER TABLE public.cg_touchpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cg_tp_select" ON public.cg_touchpoints FOR SELECT TO authenticated USING (public.is_cg_coach(auth.uid()));
CREATE POLICY "cg_tp_insert" ON public.cg_touchpoints FOR INSERT TO authenticated WITH CHECK (public.is_cg_coach(auth.uid()) AND user_id = auth.uid());
CREATE POLICY "cg_tp_delete_own" ON public.cg_touchpoints FOR DELETE TO authenticated USING (user_id = auth.uid());
