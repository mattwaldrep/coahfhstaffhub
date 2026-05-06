
-- ============ Part 1: extend calendar_events ============

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS other_listings text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS room_needed text,
  ADD COLUMN IF NOT EXISTS action_note text,
  ADD COLUMN IF NOT EXISTS missions_team_needed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS church_covering text;

-- ============ Part 2: annual planning ============

CREATE TYPE public.planning_cycle_status AS ENUM ('open', 'review', 'closed');
CREATE TYPE public.plan_submission_status AS ENUM ('draft', 'submitted', 'in_review', 'approved', 'partially_approved', 'rejected');
CREATE TYPE public.proposed_event_status AS ENUM ('pending', 'approved', 'rejected');

-- Cycles
CREATE TABLE public.calendar_planning_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_year INT NOT NULL,
  title TEXT NOT NULL,
  opens_at DATE NOT NULL,
  closes_at DATE NOT NULL,
  status public.planning_cycle_status NOT NULL DEFAULT 'open',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.calendar_planning_cycles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER calendar_planning_cycles_updated_at BEFORE UPDATE ON public.calendar_planning_cycles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Authenticated can view cycles" ON public.calendar_planning_cycles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Core can manage cycles" ON public.calendar_planning_cycles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'core'))
  WITH CHECK (public.has_role(auth.uid(), 'core'));

-- Submissions
CREATE TABLE public.calendar_plan_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES public.calendar_planning_cycles(id) ON DELETE CASCADE,
  leader_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sub_calendar public.sub_calendar NOT NULL,
  title TEXT,
  status public.plan_submission_status NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewer_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, leader_id, sub_calendar)
);
ALTER TABLE public.calendar_plan_submissions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER calendar_plan_submissions_updated_at BEFORE UPDATE ON public.calendar_plan_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Owner can read/write their own draft; everyone can read once submitted (status != 'draft'); Core can manage all.
CREATE POLICY "Owner reads own submission" ON public.calendar_plan_submissions
  FOR SELECT TO authenticated USING (leader_id = auth.uid());
CREATE POLICY "Staff reads submitted submissions" ON public.calendar_plan_submissions
  FOR SELECT TO authenticated USING (status <> 'draft');
CREATE POLICY "Owner inserts own draft" ON public.calendar_plan_submissions
  FOR INSERT TO authenticated WITH CHECK (leader_id = auth.uid());
CREATE POLICY "Owner updates own draft" ON public.calendar_plan_submissions
  FOR UPDATE TO authenticated USING (leader_id = auth.uid() AND status IN ('draft','submitted'))
  WITH CHECK (leader_id = auth.uid());
CREATE POLICY "Owner deletes own draft" ON public.calendar_plan_submissions
  FOR DELETE TO authenticated USING (leader_id = auth.uid() AND status = 'draft');
CREATE POLICY "Core manages submissions" ON public.calendar_plan_submissions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'core'))
  WITH CHECK (public.has_role(auth.uid(), 'core'));

-- Proposed events
CREATE TABLE public.calendar_proposed_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.calendar_plan_submissions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sub_calendar public.sub_calendar NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  all_day BOOLEAN NOT NULL DEFAULT false,
  category TEXT,
  leader_name TEXT,
  location TEXT,
  room_needed TEXT,
  action_note TEXT,
  pco_registration BOOLEAN NOT NULL DEFAULT false,
  missions_team_needed BOOLEAN NOT NULL DEFAULT false,
  church_covering TEXT,
  other_listings TEXT[] NOT NULL DEFAULT '{}',
  status public.proposed_event_status NOT NULL DEFAULT 'pending',
  reviewer_note TEXT,
  approved_event_id UUID REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.calendar_proposed_events ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER calendar_proposed_events_updated_at BEFORE UPDATE ON public.calendar_proposed_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_proposed_events_submission ON public.calendar_proposed_events(submission_id);
CREATE INDEX idx_proposed_events_start ON public.calendar_proposed_events(start_at);

-- Read: owner of parent submission OR (parent submitted AND staff) OR core.
CREATE POLICY "Owner reads own proposed events" ON public.calendar_proposed_events
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.calendar_plan_submissions s
            WHERE s.id = submission_id AND s.leader_id = auth.uid())
  );
CREATE POLICY "Staff reads submitted proposed events" ON public.calendar_proposed_events
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.calendar_plan_submissions s
            WHERE s.id = submission_id AND s.status <> 'draft')
  );
CREATE POLICY "Owner writes own draft proposed events" ON public.calendar_proposed_events
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.calendar_plan_submissions s
            WHERE s.id = submission_id AND s.leader_id = auth.uid() AND s.status = 'draft')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.calendar_plan_submissions s
            WHERE s.id = submission_id AND s.leader_id = auth.uid() AND s.status = 'draft')
  );
CREATE POLICY "Core manages proposed events" ON public.calendar_proposed_events
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'core'))
  WITH CHECK (public.has_role(auth.uid(), 'core'));
