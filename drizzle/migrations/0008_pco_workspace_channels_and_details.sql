ALTER TABLE public.pco_calendar_workspaces
  ADD COLUMN channels text[] NOT NULL DEFAULT '{}',
  ADD COLUMN owner_id uuid,
  ADD COLUMN location_note text,
  ADD COLUMN rooms_note text;