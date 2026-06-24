CREATE TABLE public.comms_channel_managers (
  channel_key text PRIMARY KEY,
  manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comms_channel_managers TO authenticated;
GRANT ALL ON public.comms_channel_managers TO service_role;

ALTER TABLE public.comms_channel_managers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read comms managers"
  ON public.comms_channel_managers FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Core can manage comms managers"
  ON public.comms_channel_managers FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'core'))
  WITH CHECK (public.has_role(auth.uid(), 'core'));

CREATE TRIGGER comms_channel_managers_updated_at
  BEFORE UPDATE ON public.comms_channel_managers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();