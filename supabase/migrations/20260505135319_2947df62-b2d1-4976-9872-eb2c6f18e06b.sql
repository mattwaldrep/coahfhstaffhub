
-- 1. user_integrations: per-user OAuth tokens
CREATE TABLE public.user_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  refresh_token text NOT NULL,
  access_token text,
  expires_at timestamptz,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own integrations" ON public.user_integrations
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER user_integrations_updated_at BEFORE UPDATE ON public.user_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. action_items: track Google Tasks push
ALTER TABLE public.action_items
  ADD COLUMN google_task_id text,
  ADD COLUMN google_task_pushed_at timestamptz,
  ADD COLUMN google_task_pushed_by uuid;

-- 3. meetings: recap_sent_at
ALTER TABLE public.meetings
  ADD COLUMN recap_sent_at timestamptz;

-- 4. mission_trips: itinerary_file_path
ALTER TABLE public.mission_trips
  ADD COLUMN itinerary_file_path text,
  ADD COLUMN itinerary_file_name text;

-- 5. storage bucket for mission trips
INSERT INTO storage.buckets (id, name, public) VALUES ('mission-trips', 'mission-trips', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Staff read mission files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'mission-trips' AND has_any_role(auth.uid(), ARRAY['core'::app_role,'meeting'::app_role,'extended'::app_role]));
CREATE POLICY "Staff upload mission files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'mission-trips' AND has_any_role(auth.uid(), ARRAY['core'::app_role,'meeting'::app_role]));
CREATE POLICY "Staff delete mission files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'mission-trips' AND has_any_role(auth.uid(), ARRAY['core'::app_role,'meeting'::app_role]));
