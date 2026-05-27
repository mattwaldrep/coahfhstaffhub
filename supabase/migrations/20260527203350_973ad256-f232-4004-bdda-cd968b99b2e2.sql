ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS room_request_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS room_approval_received boolean NOT NULL DEFAULT false;