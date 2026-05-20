
-- TABLES
CREATE TABLE public.onboarding_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.onboarding_templates(id) ON DELETE CASCADE,
  section_name text NOT NULL,
  task_name text NOT NULL,
  description text,
  is_onsite_only boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX onboarding_templates_parent_idx ON public.onboarding_templates(parent_id);

CREATE TABLE public.onboarding_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  new_hire_name text NOT NULL,
  new_hire_email text,
  user_id uuid,
  hire_type text NOT NULL CHECK (hire_type IN ('onsite','remote','hybrid')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','archived')),
  start_date date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.onboarding_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.onboarding_workflows(id) ON DELETE CASCADE,
  parent_task_id uuid REFERENCES public.onboarding_tasks(id) ON DELETE CASCADE,
  source_template_id uuid,
  section_name text NOT NULL,
  task_name text NOT NULL,
  description text,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by uuid,
  is_skipped boolean NOT NULL DEFAULT false,
  skipped_reason text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX onboarding_tasks_workflow_idx ON public.onboarding_tasks(workflow_id);
CREATE INDEX onboarding_tasks_parent_idx ON public.onboarding_tasks(parent_task_id);

-- TRIGGERS
CREATE TRIGGER onboarding_templates_updated BEFORE UPDATE ON public.onboarding_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER onboarding_workflows_updated BEFORE UPDATE ON public.onboarding_workflows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER onboarding_tasks_updated BEFORE UPDATE ON public.onboarding_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.onboarding_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view templates" ON public.onboarding_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Core manages templates" ON public.onboarding_templates
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'core'::app_role))
  WITH CHECK (has_role(auth.uid(), 'core'::app_role));

CREATE POLICY "Authenticated view workflows" ON public.onboarding_workflows
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Core manages workflows" ON public.onboarding_workflows
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'core'::app_role))
  WITH CHECK (has_role(auth.uid(), 'core'::app_role));

CREATE POLICY "Authenticated view tasks" ON public.onboarding_tasks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Core manages tasks" ON public.onboarding_tasks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'core'::app_role))
  WITH CHECK (has_role(auth.uid(), 'core'::app_role));

-- SEED MASTER TEMPLATE
DO $seed$
DECLARE
  v_culture uuid; v_leadership uuid; v_assessments uuid;
  v_role uuid; v_wins uuid; v_checkin uuid; v_systems uuid; v_purchasing uuid;
  v_community uuid;
BEGIN

-- Section: Arrival
INSERT INTO public.onboarding_templates (section_name, task_name, sort_order)
  VALUES ('Arrival','Warm Welcome',10);
INSERT INTO public.onboarding_templates (section_name, task_name, description, is_onsite_only, sort_order)
  VALUES ('Arrival','Put Together a Welcome Kit',
    'Toilet paper, paper towels, dish soap, hand soap, chips, Skittles, Hersheys, Powerade, gift certificate to a pizza place for an easy dinner.',
    true, 20);

-- Section: Organizational Onboarding
INSERT INTO public.onboarding_templates (section_name, task_name, sort_order) VALUES
  ('Organizational Onboarding','Setup Email Address',10);
INSERT INTO public.onboarding_templates (section_name, task_name, is_onsite_only, sort_order) VALUES
  ('Organizational Onboarding','Provide set of keys', true, 20);
INSERT INTO public.onboarding_templates (section_name, task_name, sort_order) VALUES
  ('Organizational Onboarding','Provide Employee Handbook/Personnel Policies',30),
  ('Organizational Onboarding','Setup Payroll',40),
  ('Organizational Onboarding','Get headshot',50),
  ('Organizational Onboarding','Put profile on website',60);

-- Section: First Week
INSERT INTO public.onboarding_templates (section_name, task_name, sort_order) VALUES
  ('First Week','Provide Mentor',10),
  ('First Week','First Few Days of Work Plan',20);

-- Section: Day 1
INSERT INTO public.onboarding_templates (section_name, task_name, is_onsite_only, sort_order) VALUES
  ('Day 1','Welcome Lunch', true, 10);

INSERT INTO public.onboarding_templates (section_name, task_name, sort_order) VALUES
  ('Day 1','Culture',20) RETURNING id INTO v_culture;
INSERT INTO public.onboarding_templates (parent_id, section_name, task_name, sort_order) VALUES
  (v_culture,'Day 1','Walk through vision, mission, values of the church',10),
  (v_culture,'Day 1','Discuss the marks of a disciple at COAH',20),
  (v_culture,'Day 1','Dress code',30),
  (v_culture,'Day 1','Team Culture',40),
  (v_culture,'Day 1','Time Expectations',50),
  (v_culture,'Day 1','Caring Well Training',60);

INSERT INTO public.onboarding_templates (section_name, task_name, sort_order) VALUES
  ('Day 1','Leadership',30) RETURNING id INTO v_leadership;
INSERT INTO public.onboarding_templates (parent_id, section_name, task_name, sort_order) VALUES
  (v_leadership,'Day 1','Staff',10),
  (v_leadership,'Day 1','Elders',20),
  (v_leadership,'Day 1','Deacons',30),
  (v_leadership,'Day 1','Weekly Staff Meeting',40),
  (v_leadership,'Day 1','Organizational Chart - Direct Report to Lead Pastor',50);

INSERT INTO public.onboarding_templates (section_name, task_name, sort_order) VALUES
  ('Day 1','Assessments',40) RETURNING id INTO v_assessments;
INSERT INTO public.onboarding_templates (parent_id, section_name, task_name, sort_order) VALUES
  (v_assessments,'Day 1','Complete Working Genius Assessment',10),
  (v_assessments,'Day 1','Complete Enneagram Assessment (or provide)',20);

-- Section: Day 2
INSERT INTO public.onboarding_templates (section_name, task_name, sort_order) VALUES
  ('Day 2','Review role description',10) RETURNING id INTO v_role;
INSERT INTO public.onboarding_templates (parent_id, section_name, task_name, sort_order) VALUES
  (v_role,'Day 2','Set goals',10);
INSERT INTO public.onboarding_templates (parent_id, section_name, task_name, sort_order) VALUES
  (v_role,'Day 2','Wins for the First 90 Days',20) RETURNING id INTO v_wins;
INSERT INTO public.onboarding_templates (parent_id, section_name, task_name, sort_order) VALUES
  (v_wins,'Day 2','Familiarize with all church systems',10),
  (v_wins,'Day 2','Take on core administrative tasks (Newsletter, Calendar, Communication, Purchasing)',20),
  (v_wins,'Day 2','Integrate into church staff culture',30);

INSERT INTO public.onboarding_templates (section_name, task_name, sort_order) VALUES
  ('Day 2','Check In & Evaluation',20) RETURNING id INTO v_checkin;
INSERT INTO public.onboarding_templates (parent_id, section_name, task_name, sort_order) VALUES
  (v_checkin,'Day 2','Setup Weekly 1-on-1 check in on calendar',10),
  (v_checkin,'Day 2','Setup 30, 60, 90 day evaluations',20);

INSERT INTO public.onboarding_templates (section_name, task_name, sort_order) VALUES
  ('Day 2','Review church systems',30) RETURNING id INTO v_systems;
INSERT INTO public.onboarding_templates (parent_id, section_name, task_name, sort_order) VALUES
  (v_systems,'Day 2','Planning Center',10),
  (v_systems,'Day 2','Calendar',20),
  (v_systems,'Day 2','Google Drive',30),
  (v_systems,'Day 2','Worship Planning',40),
  (v_systems,'Day 2','CG Strategy',50),
  (v_systems,'Day 2','Pay schedule',60);
INSERT INTO public.onboarding_templates (parent_id, section_name, task_name, sort_order) VALUES
  (v_systems,'Day 2','Purchasing via Bill.com',70) RETURNING id INTO v_purchasing;
INSERT INTO public.onboarding_templates (parent_id, section_name, task_name, sort_order) VALUES
  (v_purchasing,'Day 2','Amazon Account Setup',10),
  (v_purchasing,'Day 2','Uploading digital receipts directly to Bill.com',20),
  (v_purchasing,'Day 2','Reconcile expenses inside Bill.com',30);

-- Section: Day 3
INSERT INTO public.onboarding_templates (section_name, task_name, sort_order) VALUES
  ('Day 3','Review Personnel Policies',10);
INSERT INTO public.onboarding_templates (section_name, task_name, sort_order) VALUES
  ('Day 3','Familiarize with the community',20) RETURNING id INTO v_community;
INSERT INTO public.onboarding_templates (parent_id, section_name, task_name, sort_order) VALUES
  (v_community,'Day 3','Demographics (Average income, family size, local schools, cultural demographics)',10),
  (v_community,'Day 3','Culture (Favorite local restaurants, grocery stores, entertainment options)',20);

-- Section: Day 4
INSERT INTO public.onboarding_templates (section_name, task_name, sort_order) VALUES
  ('Day 4','Plan team building event for staff',10);

-- Section: End of Week Eval
INSERT INTO public.onboarding_templates (section_name, task_name, sort_order) VALUES
  ('End of Week Eval','Was training adequate?',10),
  ('End of Week Eval','Was the job description accurate?',20),
  ('End of Week Eval','Was the mentor assignment effective?',30),
  ('End of Week Eval','Were performance expectations clear?',40);

END $seed$;
