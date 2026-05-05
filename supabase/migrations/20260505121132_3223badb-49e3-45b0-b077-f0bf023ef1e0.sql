
CREATE TABLE public.sunday_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_of date NOT NULL,
  attendance integer,
  giving numeric(10,2),
  first_time_guests integer,
  highlights text,
  lowlights text,
  prayer_needs text,
  follow_ups text,
  submitted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_of)
);

ALTER TABLE public.sunday_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view sunday reviews" ON public.sunday_reviews
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['core'::app_role, 'meeting'::app_role, 'extended'::app_role]));

CREATE POLICY "Staff can insert sunday reviews" ON public.sunday_reviews
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['core'::app_role, 'meeting'::app_role]));

CREATE POLICY "Submitter or core can update" ON public.sunday_reviews
  FOR UPDATE TO authenticated
  USING (submitted_by = auth.uid() OR public.has_role(auth.uid(), 'core'::app_role));

CREATE POLICY "Core can delete" ON public.sunday_reviews
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'core'::app_role));

CREATE TRIGGER sunday_reviews_updated_at BEFORE UPDATE ON public.sunday_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sunday_reviews REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sunday_reviews;
