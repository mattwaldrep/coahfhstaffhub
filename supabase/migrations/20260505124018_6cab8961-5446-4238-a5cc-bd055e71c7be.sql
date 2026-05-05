
CREATE TYPE public.trip_status AS ENUM ('not_started','tbc','pre_trip','in_field','complete','cancelled');

CREATE TABLE public.mission_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_name text NOT NULL,
  start_date date,
  end_date date,
  leader_name text,
  leader_phone text,
  leader_email text,
  primary_focus text,
  team_number text,
  status public.trip_status NOT NULL DEFAULT 'not_started',
  itinerary_link text,
  notes text,
  steps jsonb NOT NULL DEFAULT '{}'::jsonb,
  position integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mission_trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view trips"
  ON public.mission_trips FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['core'::app_role,'meeting'::app_role,'extended'::app_role]));

CREATE POLICY "Staff can manage trips"
  ON public.mission_trips FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['core'::app_role,'meeting'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['core'::app_role,'meeting'::app_role]));

CREATE TRIGGER set_updated_at_mission_trips
  BEFORE UPDATE ON public.mission_trips
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.mission_trips;
