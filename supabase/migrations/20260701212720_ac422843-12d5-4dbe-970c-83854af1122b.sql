
-- Ministry area enum
CREATE TYPE public.ministry_area AS ENUM (
  'Worship','AV','Prayer','Hospitality','Set Up','Creative',
  'Men''s','Women''s','Kids','Youth','Connect','Other'
);

CREATE TYPE public.ministry_plan_status AS ENUM (
  'draft','submitted','under_review','approved'
);

CREATE TABLE public.ministry_action_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leader_name text NOT NULL DEFAULT '',
  ministry_area public.ministry_area,
  calendar_year int NOT NULL DEFAULT EXTRACT(YEAR FROM now())::int,
  purpose text NOT NULL DEFAULT '',
  programs jsonb NOT NULL DEFAULT '[]'::jsonb,
  org_structure text NOT NULL DEFAULT '',
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  weaknesses jsonb NOT NULL DEFAULT '[]'::jsonb,
  opportunities jsonb NOT NULL DEFAULT '[]'::jsonb,
  threats jsonb NOT NULL DEFAULT '[]'::jsonb,
  goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  status public.ministry_plan_status NOT NULL DEFAULT 'draft',
  submitted_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ministry_action_plans_unique_user_area_year
  ON public.ministry_action_plans (user_id, ministry_area, calendar_year)
  WHERE ministry_area IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ministry_action_plans TO authenticated;
GRANT ALL ON public.ministry_action_plans TO service_role;

ALTER TABLE public.ministry_action_plans ENABLE ROW LEVEL SECURITY;

-- Owners can select their own plans
CREATE POLICY "Owners can view own plans"
  ON public.ministry_action_plans FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Staff Pastors (core role) can view all
CREATE POLICY "Staff pastors can view all plans"
  ON public.ministry_action_plans FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'core'));

-- Owners can insert their own plans
CREATE POLICY "Owners can insert own plans"
  ON public.ministry_action_plans FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Owners can update their draft plans; submitting (draft->submitted) allowed
CREATE POLICY "Owners can update own draft plans"
  ON public.ministry_action_plans FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND status IN ('draft','submitted'))
  WITH CHECK (auth.uid() = user_id);

-- Owners can delete their own draft plans
CREATE POLICY "Owners can delete own draft plans"
  ON public.ministry_action_plans FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id AND status = 'draft');

-- Staff pastors can update status/reviewer on any plan
CREATE POLICY "Staff pastors can update any plan"
  ON public.ministry_action_plans FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'core'))
  WITH CHECK (public.has_role(auth.uid(), 'core'));

CREATE TRIGGER ministry_action_plans_set_updated_at
  BEFORE UPDATE ON public.ministry_action_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
