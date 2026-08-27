ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS pco_signup_id text,
  ADD COLUMN IF NOT EXISTS pco_signup_time_id text,
  ADD COLUMN IF NOT EXISTS pco_signup_url text,
  ADD COLUMN IF NOT EXISTS pco_synced_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_pco_signup_time_id_key
  ON public.calendar_events (pco_signup_time_id)
  WHERE pco_signup_time_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.pco_signup_ignores (
  signup_time_id text PRIMARY KEY,
  signup_id text NOT NULL,
  signup_name text,
  ignored_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.pco_signup_ignores TO authenticated;
GRANT ALL ON public.pco_signup_ignores TO service_role;

ALTER TABLE public.pco_signup_ignores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view dismissed signups"
  ON public.pco_signup_ignores FOR SELECT TO authenticated
  USING (public.is_staff_member(auth.uid()));

CREATE POLICY "Core and meeting staff can dismiss signups"
  ON public.pco_signup_ignores FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['core','meeting']::app_role[]));

CREATE POLICY "Core and meeting staff can restore signups"
  ON public.pco_signup_ignores FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['core','meeting']::app_role[]));