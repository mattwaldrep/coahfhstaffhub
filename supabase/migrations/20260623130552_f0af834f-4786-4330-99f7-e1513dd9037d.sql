
CREATE TABLE public.elder_threshold_notifications (
  pco_person_id TEXT NOT NULL,
  threshold INT NOT NULL CHECK (threshold IN (45, 60)),
  last_notified_days INT NOT NULL,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pco_person_id, threshold)
);

GRANT ALL ON public.elder_threshold_notifications TO service_role;
ALTER TABLE public.elder_threshold_notifications ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only access via cron jobs.
