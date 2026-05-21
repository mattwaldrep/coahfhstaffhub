ALTER TABLE public.mission_trips
  ADD COLUMN IF NOT EXISTS itinerary_doc_id text,
  ADD COLUMN IF NOT EXISTS itinerary_doc_url text;