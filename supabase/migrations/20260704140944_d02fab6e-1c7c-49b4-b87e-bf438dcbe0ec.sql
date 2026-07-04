
CREATE TABLE public.calendar_sub_calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  color_token text NOT NULL DEFAULT 'var(--cal-general)',
  sort_order int NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'custom' CHECK (source IN ('system','pco_team','custom')),
  pco_group_id text UNIQUE,
  owner_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_sub_calendars TO authenticated;
GRANT ALL ON public.calendar_sub_calendars TO service_role;
ALTER TABLE public.calendar_sub_calendars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read sub-calendars" ON public.calendar_sub_calendars FOR SELECT TO authenticated USING (true);
CREATE POLICY "Core manages sub-calendars" ON public.calendar_sub_calendars FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'core'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'core'::app_role));
CREATE TRIGGER calendar_sub_calendars_updated_at BEFORE UPDATE ON public.calendar_sub_calendars
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.calendar_sub_calendar_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pco_group_id text NOT NULL UNIQUE,
  group_name text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_sub_calendar_suggestions TO authenticated;
GRANT ALL ON public.calendar_sub_calendar_suggestions TO service_role;
ALTER TABLE public.calendar_sub_calendar_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Core manages suggestions" ON public.calendar_sub_calendar_suggestions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'core'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'core'::app_role));
CREATE TRIGGER calendar_sub_calendar_suggestions_updated_at BEFORE UPDATE ON public.calendar_sub_calendar_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Drop defaults tied to the old enum, convert to text, restore defaults
ALTER TABLE public.calendar_events         ALTER COLUMN sub_calendar DROP DEFAULT;
ALTER TABLE public.calendar_proposed_events ALTER COLUMN sub_calendar DROP DEFAULT;
ALTER TABLE public.calendar_plan_submissions ALTER COLUMN sub_calendar DROP DEFAULT;

ALTER TABLE public.calendar_events         ALTER COLUMN sub_calendar TYPE text USING sub_calendar::text;
ALTER TABLE public.calendar_proposed_events ALTER COLUMN sub_calendar TYPE text USING sub_calendar::text;
ALTER TABLE public.calendar_plan_submissions ALTER COLUMN sub_calendar TYPE text USING sub_calendar::text;

ALTER TABLE public.calendar_events         ALTER COLUMN sub_calendar SET DEFAULT 'general';
ALTER TABLE public.calendar_proposed_events ALTER COLUMN sub_calendar SET DEFAULT 'general';

UPDATE public.calendar_events         SET sub_calendar = 'general' WHERE sub_calendar = 'forest_hills_main';
UPDATE public.calendar_proposed_events SET sub_calendar = 'general' WHERE sub_calendar = 'forest_hills_main';
UPDATE public.calendar_plan_submissions SET sub_calendar = 'general' WHERE sub_calendar = 'forest_hills_main';

UPDATE public.calendar_events
  SET other_listings = array_replace(other_listings, 'forest_hills_main', 'general')
  WHERE 'forest_hills_main' = ANY(other_listings);
UPDATE public.calendar_proposed_events
  SET other_listings = array_replace(other_listings, 'forest_hills_main', 'general')
  WHERE 'forest_hills_main' = ANY(other_listings);

DROP TYPE IF EXISTS public.sub_calendar CASCADE;

INSERT INTO public.calendar_sub_calendars (key, name, color_token, sort_order, source) VALUES
  ('general', 'General', 'var(--cal-main)',  10, 'system'),
  ('coah_lm', 'COAH:LM', 'var(--cal-lm)',    20, 'system'),
  ('youth',   'Youth',   'var(--cal-youth)', 30, 'system')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_edit_sub_calendar(_user_id uuid, _key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'core'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.calendar_sub_calendars
      WHERE key = _key AND owner_user_id = _user_id AND is_active = true
    )
$$;

DROP POLICY IF EXISTS "Core can manage events" ON public.calendar_events;
CREATE POLICY "Core or sub-calendar owner manages events"
  ON public.calendar_events FOR ALL TO authenticated
  USING (public.can_edit_sub_calendar(auth.uid(), sub_calendar))
  WITH CHECK (public.can_edit_sub_calendar(auth.uid(), sub_calendar));
