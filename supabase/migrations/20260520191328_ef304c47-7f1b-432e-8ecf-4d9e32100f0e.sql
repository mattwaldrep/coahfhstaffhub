ALTER TABLE public.calendar_events
  ADD COLUMN room_not_needed boolean NOT NULL DEFAULT false,
  ADD COLUMN leader_not_needed boolean NOT NULL DEFAULT false;

ALTER TABLE public.calendar_proposed_events
  ADD COLUMN room_not_needed boolean NOT NULL DEFAULT false,
  ADD COLUMN leader_not_needed boolean NOT NULL DEFAULT false;