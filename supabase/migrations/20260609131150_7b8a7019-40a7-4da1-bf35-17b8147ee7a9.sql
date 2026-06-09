ALTER TABLE public.event_rooms
  ADD COLUMN IF NOT EXISTS request_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_received boolean NOT NULL DEFAULT false;

-- Backfill from event-level flags for existing non-office rooms.
UPDATE public.event_rooms er
SET request_submitted = COALESCE(ce.room_request_submitted, false),
    approval_received = COALESCE(ce.room_approval_received, false)
FROM public.calendar_events ce, public.rooms r
WHERE er.event_id = ce.id
  AND er.room_id = r.id
  AND lower(trim(r.name)) <> 'office';