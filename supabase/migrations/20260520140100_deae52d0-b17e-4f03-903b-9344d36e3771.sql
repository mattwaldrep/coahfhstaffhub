
-- ============================================================
-- Phase 2 + Phase 3 schema: rooms, class series, decisions, nudges
-- ============================================================

-- ----- ROOMS & RESOURCE BOOKING -----
CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  capacity int,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view rooms" ON public.rooms
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Core can manage rooms" ON public.rooms
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'core'::app_role))
  WITH CHECK (has_role(auth.uid(), 'core'::app_role));
CREATE TRIGGER rooms_set_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.event_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, room_id)
);
CREATE INDEX event_rooms_event_idx ON public.event_rooms(event_id);
CREATE INDEX event_rooms_room_idx ON public.event_rooms(room_id);
ALTER TABLE public.event_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view event rooms" ON public.event_rooms
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Core can manage event rooms" ON public.event_rooms
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'core'::app_role))
  WITH CHECK (has_role(auth.uid(), 'core'::app_role));

-- ----- RECURRING CLASS SERIES -----
CREATE TABLE public.class_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time,
  end_time time,
  default_teacher_name text,
  default_leader_name text,
  default_childcare_needed boolean NOT NULL DEFAULT false,
  default_room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.class_series ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view class series" ON public.class_series
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Core can manage class series" ON public.class_series
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'core'::app_role))
  WITH CHECK (has_role(auth.uid(), 'core'::app_role));
CREATE TRIGGER class_series_set_updated_at
  BEFORE UPDATE ON public.class_series
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.calendar_events
  ADD COLUMN class_series_id uuid REFERENCES public.class_series(id) ON DELETE SET NULL;

-- ----- DECISIONS / VOTING LOG -----
CREATE TABLE public.decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
  title text NOT NULL,
  motion_text text,
  outcome text NOT NULL DEFAULT 'pending' CHECK (outcome IN ('passed','failed','tabled','pending')),
  vote_yes int NOT NULL DEFAULT 0,
  vote_no int NOT NULL DEFAULT 0,
  vote_abstain int NOT NULL DEFAULT 0,
  decided_by uuid,
  decided_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX decisions_meeting_idx ON public.decisions(meeting_id);
CREATE INDEX decisions_decided_at_idx ON public.decisions(decided_at DESC);
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view decisions" ON public.decisions
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['core'::app_role, 'meeting'::app_role, 'extended'::app_role]));
CREATE POLICY "Staff can manage decisions" ON public.decisions
  FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['core'::app_role, 'meeting'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['core'::app_role, 'meeting'::app_role]));
CREATE TRIGGER decisions_set_updated_at
  BEFORE UPDATE ON public.decisions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----- SUNDAY REVIEW NUDGES BY ROLE -----
CREATE TABLE public.sunday_review_nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  section text NOT NULL,
  weekday_offset smallint NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, section)
);
ALTER TABLE public.sunday_review_nudges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view nudges" ON public.sunday_review_nudges
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Core can manage nudges" ON public.sunday_review_nudges
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'core'::app_role))
  WITH CHECK (has_role(auth.uid(), 'core'::app_role));
CREATE TRIGGER sunday_review_nudges_set_updated_at
  BEFORE UPDATE ON public.sunday_review_nudges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----- SEED COMMON ROOMS -----
INSERT INTO public.rooms (name, capacity, notes) VALUES
  ('Sanctuary', 300, 'Main worship space'),
  ('Chapel', 60, 'Small worship / prayer'),
  ('Fellowship Hall', 150, 'Meals, events'),
  ('Classroom A', 20, NULL),
  ('Classroom B', 20, NULL),
  ('Nursery', 25, 'Childcare'),
  ('Youth Room', 40, NULL),
  ('Conference Room', 12, 'Staff/elder meetings')
ON CONFLICT (name) DO NOTHING;
