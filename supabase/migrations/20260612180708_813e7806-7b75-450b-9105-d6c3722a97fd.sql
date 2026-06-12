
CREATE TABLE public.calendar_event_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_event_categories TO authenticated;
GRANT ALL ON public.calendar_event_categories TO service_role;

ALTER TABLE public.calendar_event_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read categories"
  ON public.calendar_event_categories FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Core can insert categories"
  ON public.calendar_event_categories FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'core'));

CREATE POLICY "Core can update categories"
  ON public.calendar_event_categories FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'core'));

CREATE POLICY "Core can delete categories"
  ON public.calendar_event_categories FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'core'));

CREATE TRIGGER set_calendar_event_categories_updated_at
  BEFORE UPDATE ON public.calendar_event_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.calendar_event_categories (name, sort_order) VALUES
  ('Holiday', 10),
  ('Leadership', 20),
  ('Women', 30),
  ('Men', 40),
  ('Class', 50),
  ('Social', 60),
  ('Kids/Youth', 70),
  ('Liturgical', 80),
  ('Meeting', 90),
  ('Church Plant', 100),
  ('Community Group', 110),
  ('Love DOT', 120),
  ('Prayer', 130),
  ('Core Team', 140),
  ('Other', 150)
ON CONFLICT (name) DO NOTHING;
