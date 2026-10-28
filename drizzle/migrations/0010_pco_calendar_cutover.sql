ALTER TABLE public.meeting_event_notes ADD COLUMN pco_instance_id text;
CREATE UNIQUE INDEX meeting_event_notes_pco_key ON public.meeting_event_notes (meeting_id, pco_instance_id, occurrence_date) WHERE pco_instance_id IS NOT NULL;
COMMENT ON COLUMN public.meeting_event_notes.pco_instance_id IS 'Planning Center calendar event-instance id for discussion notes on PCO-backed events; event_id remains for archived Hub calendar events.';
COMMENT ON TABLE public.calendar_planning_cycles IS 'DEPRECATED: planning cycles retired when the calendar moved to Planning Center; retained for history.';
COMMENT ON TABLE public.calendar_plan_submissions IS 'DEPRECATED: planning cycles retired when the calendar moved to Planning Center; retained for history.';
COMMENT ON TABLE public.calendar_proposed_events IS 'DEPRECATED: planning cycles retired when the calendar moved to Planning Center; retained for history.';