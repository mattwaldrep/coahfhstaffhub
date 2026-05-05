
-- Deduplicate meetings by date (keep earliest)
DELETE FROM public.meetings m
USING public.meetings m2
WHERE m.meeting_date = m2.meeting_date
  AND m.created_at > m2.created_at;

ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_meeting_date_unique UNIQUE (meeting_date);

-- Deduplicate sunday_reviews per submitter+date
DELETE FROM public.sunday_reviews r
USING public.sunday_reviews r2
WHERE r.service_date = r2.service_date
  AND r.submitted_by = r2.submitted_by
  AND r.submitted_by IS NOT NULL
  AND r.created_at > r2.created_at;

ALTER TABLE public.sunday_reviews
  ADD CONSTRAINT sunday_reviews_date_submitter_unique UNIQUE (service_date, submitted_by);
