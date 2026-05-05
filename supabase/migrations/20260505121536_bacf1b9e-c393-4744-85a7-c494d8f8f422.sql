
ALTER TABLE public.sunday_reviews
  DROP COLUMN attendance,
  DROP COLUMN giving,
  DROP COLUMN first_time_guests,
  DROP COLUMN highlights,
  DROP COLUMN lowlights,
  DROP COLUMN prayer_needs,
  DROP COLUMN follow_ups;

ALTER TABLE public.sunday_reviews RENAME COLUMN week_of TO service_date;

ALTER TABLE public.sunday_reviews
  ADD COLUMN worship_rating smallint CHECK (worship_rating BETWEEN 1 AND 5),
  ADD COLUMN worship_notes text,
  ADD COLUMN confession_rating smallint CHECK (confession_rating BETWEEN 1 AND 5),
  ADD COLUMN confession_notes text,
  ADD COLUMN connect_rating smallint CHECK (connect_rating BETWEEN 1 AND 5),
  ADD COLUMN connect_notes text,
  ADD COLUMN sermon_rating smallint CHECK (sermon_rating BETWEEN 1 AND 5),
  ADD COLUMN sermon_notes text,
  ADD COLUMN wins text,
  ADD COLUMN opportunities text;

-- drop unique on week_of (now service_date) so multiple staff can submit per service
ALTER TABLE public.sunday_reviews DROP CONSTRAINT sunday_reviews_week_of_key;
