DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['event_checklist_items','calendar_event_categories','rooms','event_rooms','class_series','event_template_attachments','event_template_item_state','event_sunday_slots','event_plan_templates','calendar_sub_calendars','calendar_sub_calendar_suggestions']
  LOOP
    EXECUTE format('CREATE POLICY "Calendar admins manage %s" ON public.%I FOR ALL TO authenticated USING (public.is_calendar_admin(auth.uid())) WITH CHECK (public.is_calendar_admin(auth.uid()))', t, t);
  END LOOP;
END $$;