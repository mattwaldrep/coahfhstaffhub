
-- 1. Extend role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'elder';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'elder_candidate';

COMMIT;

-- 2. Helper functions
CREATE OR REPLACE FUNCTION public.is_full_elder(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'elder')
$$;

CREATE OR REPLACE FUNCTION public.has_any_elder_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('elder', 'elder_candidate')
  )
$$;

-- 3. Elder meetings
CREATE TABLE public.elder_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_date date NOT NULL,
  meeting_type text NOT NULL DEFAULT 'standard' CHECK (meeting_type IN ('standard','joint')),
  title text NOT NULL DEFAULT 'Elder Meeting',
  location text,
  start_time time,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_progress','complete','archived')),
  notes text,
  agenda jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  completed_at timestamptz,
  briefing_sent_at timestamptz,
  recap_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.elder_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY elder_meetings_select ON public.elder_meetings FOR SELECT TO authenticated
  USING (public.has_any_elder_access(auth.uid()));
CREATE POLICY elder_meetings_insert ON public.elder_meetings FOR INSERT TO authenticated
  WITH CHECK (public.has_any_elder_access(auth.uid()));
CREATE POLICY elder_meetings_update ON public.elder_meetings FOR UPDATE TO authenticated
  USING (public.has_any_elder_access(auth.uid())) WITH CHECK (public.has_any_elder_access(auth.uid()));
CREATE POLICY elder_meetings_delete ON public.elder_meetings FOR DELETE TO authenticated
  USING (public.is_full_elder(auth.uid()));

CREATE TRIGGER trg_elder_meetings_updated BEFORE UPDATE ON public.elder_meetings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Attendees
CREATE TABLE public.elder_meeting_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.elder_meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  attendee_kind text NOT NULL CHECK (attendee_kind IN ('elder','candidate')),
  present boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, user_id)
);
ALTER TABLE public.elder_meeting_attendees ENABLE ROW LEVEL SECURITY;
CREATE POLICY elder_attendees_select ON public.elder_meeting_attendees FOR SELECT TO authenticated
  USING (public.has_any_elder_access(auth.uid()));
CREATE POLICY elder_attendees_modify ON public.elder_meeting_attendees FOR ALL TO authenticated
  USING (public.has_any_elder_access(auth.uid())) WITH CHECK (public.has_any_elder_access(auth.uid()));

-- 5. Agenda items (sections)
CREATE TABLE public.elder_agenda_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.elder_meetings(id) ON DELETE CASCADE,
  section_key text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  body text,
  owner_id uuid,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','tabled')),
  executive_session boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'new' CHECK (source IN ('new','carryover','seed')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.elder_agenda_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY elder_agenda_select ON public.elder_agenda_items FOR SELECT TO authenticated
  USING (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())));
CREATE POLICY elder_agenda_insert ON public.elder_agenda_items FOR INSERT TO authenticated
  WITH CHECK (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())));
CREATE POLICY elder_agenda_update ON public.elder_agenda_items FOR UPDATE TO authenticated
  USING (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())))
  WITH CHECK (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())));
CREATE POLICY elder_agenda_delete ON public.elder_agenda_items FOR DELETE TO authenticated
  USING (public.is_full_elder(auth.uid()) OR (public.has_any_elder_access(auth.uid()) AND NOT executive_session));
CREATE TRIGGER trg_elder_agenda_updated BEFORE UPDATE ON public.elder_agenda_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Section notes
CREATE TABLE public.elder_section_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.elder_meetings(id) ON DELETE CASCADE,
  section_key text NOT NULL,
  notes text,
  executive_session boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, section_key)
);
ALTER TABLE public.elder_section_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY elder_section_notes_select ON public.elder_section_notes FOR SELECT TO authenticated
  USING (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())));
CREATE POLICY elder_section_notes_modify ON public.elder_section_notes FOR ALL TO authenticated
  USING (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())))
  WITH CHECK (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())));
CREATE TRIGGER trg_elder_section_notes_updated BEFORE UPDATE ON public.elder_section_notes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Action items
CREATE TABLE public.elder_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid REFERENCES public.elder_meetings(id) ON DELETE SET NULL,
  title text NOT NULL,
  notes text,
  assignee_id uuid,
  created_by uuid,
  completed boolean NOT NULL DEFAULT false,
  due_date date,
  executive_session boolean NOT NULL DEFAULT false,
  google_task_id text,
  google_task_pushed_at timestamptz,
  google_task_pushed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.elder_action_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY elder_action_select ON public.elder_action_items FOR SELECT TO authenticated
  USING (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())));
CREATE POLICY elder_action_modify ON public.elder_action_items FOR ALL TO authenticated
  USING (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())))
  WITH CHECK (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())));
CREATE TRIGGER trg_elder_action_updated BEFORE UPDATE ON public.elder_action_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8. Next-meeting seed
CREATE TABLE public.elder_next_meeting_seed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  section_key text NOT NULL DEFAULT 'new_business',
  executive_session boolean NOT NULL DEFAULT false,
  consumed_meeting_id uuid REFERENCES public.elder_meetings(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.elder_next_meeting_seed ENABLE ROW LEVEL SECURITY;
CREATE POLICY elder_seed_select ON public.elder_next_meeting_seed FOR SELECT TO authenticated
  USING (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())));
CREATE POLICY elder_seed_modify ON public.elder_next_meeting_seed FOR ALL TO authenticated
  USING (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())))
  WITH CHECK (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())));

-- 9. Joint deacon items
CREATE TABLE public.elder_joint_deacon_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.elder_meetings(id) ON DELETE CASCADE,
  sub_section text NOT NULL CHECK (sub_section IN ('need_to_know','resource','upcoming')),
  position integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  body text,
  executive_session boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.elder_joint_deacon_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY elder_joint_select ON public.elder_joint_deacon_items FOR SELECT TO authenticated
  USING (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())));
CREATE POLICY elder_joint_modify ON public.elder_joint_deacon_items FOR ALL TO authenticated
  USING (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())))
  WITH CHECK (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())));
CREATE TRIGGER trg_elder_joint_updated BEFORE UPDATE ON public.elder_joint_deacon_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 10. Pastoral care entries
CREATE TABLE public.pastoral_care_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_name text NOT NULL,
  assigned_elder_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','monitoring','resolved')),
  date_added date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  executive_session boolean NOT NULL DEFAULT false,
  created_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pastoral_care_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY pc_select ON public.pastoral_care_entries FOR SELECT TO authenticated
  USING (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())));
CREATE POLICY pc_modify ON public.pastoral_care_entries FOR ALL TO authenticated
  USING (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())))
  WITH CHECK (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())));
CREATE TRIGGER trg_pc_updated BEFORE UPDATE ON public.pastoral_care_entries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 11. Pastoral care updates
CREATE TABLE public.pastoral_care_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.pastoral_care_entries(id) ON DELETE CASCADE,
  author_id uuid,
  body text NOT NULL,
  executive_session boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pastoral_care_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY pcu_select ON public.pastoral_care_updates FOR SELECT TO authenticated
  USING (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())));
CREATE POLICY pcu_modify ON public.pastoral_care_updates FOR ALL TO authenticated
  USING (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())))
  WITH CHECK (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())));

-- 12. Member interviews
CREATE TABLE public.member_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_name text NOT NULL,
  assigned_elder_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','scheduled','complete')),
  scheduled_for date,
  notes text,
  executive_session boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.member_interviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY mi_select ON public.member_interviews FOR SELECT TO authenticated
  USING (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())));
CREATE POLICY mi_modify ON public.member_interviews FOR ALL TO authenticated
  USING (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())))
  WITH CHECK (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())));
CREATE TRIGGER trg_mi_updated BEFORE UPDATE ON public.member_interviews
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 13. Membership follow-ups
CREATE TABLE public.membership_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_name text NOT NULL,
  assigned_elder_id uuid,
  last_contact_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','resolved')),
  notes text,
  executive_session boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.membership_followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY mf_select ON public.membership_followups FOR SELECT TO authenticated
  USING (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())));
CREATE POLICY mf_modify ON public.membership_followups FOR ALL TO authenticated
  USING (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())))
  WITH CHECK (public.has_any_elder_access(auth.uid()) AND (NOT executive_session OR public.is_full_elder(auth.uid())));
CREATE TRIGGER trg_mf_updated BEFORE UPDATE ON public.membership_followups
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 14. Historical archive
CREATE TABLE public.elder_meeting_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_date date NOT NULL,
  meeting_type text NOT NULL DEFAULT 'standard',
  title text,
  attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
  agenda jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_text text,
  source_url text,
  imported_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.elder_meeting_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY archive_select ON public.elder_meeting_archive FOR SELECT TO authenticated
  USING (public.has_any_elder_access(auth.uid()));
CREATE POLICY archive_insert ON public.elder_meeting_archive FOR INSERT TO authenticated
  WITH CHECK (public.is_full_elder(auth.uid()));
CREATE POLICY archive_delete ON public.elder_meeting_archive FOR DELETE TO authenticated
  USING (public.is_full_elder(auth.uid()));

-- 15. Email settings (single-row)
CREATE TABLE public.elder_email_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_enabled boolean NOT NULL DEFAULT true,
  recap_enabled boolean NOT NULL DEFAULT true,
  briefing_send_hour smallint NOT NULL DEFAULT 7,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.elder_email_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ees_select ON public.elder_email_settings FOR SELECT TO authenticated
  USING (public.has_any_elder_access(auth.uid()));
CREATE POLICY ees_modify ON public.elder_email_settings FOR ALL TO authenticated
  USING (public.is_full_elder(auth.uid())) WITH CHECK (public.is_full_elder(auth.uid()));
CREATE TRIGGER trg_ees_updated BEFORE UPDATE ON public.elder_email_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.elder_email_settings DEFAULT VALUES;

-- 16. Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.elder_meetings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.elder_agenda_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.elder_section_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.elder_action_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.elder_joint_deacon_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pastoral_care_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pastoral_care_updates;

-- 17. Indices
CREATE INDEX idx_elder_agenda_meeting ON public.elder_agenda_items(meeting_id);
CREATE INDEX idx_elder_section_meeting ON public.elder_section_notes(meeting_id);
CREATE INDEX idx_elder_action_meeting ON public.elder_action_items(meeting_id);
CREATE INDEX idx_elder_action_assignee ON public.elder_action_items(assignee_id);
CREATE INDEX idx_elder_joint_meeting ON public.elder_joint_deacon_items(meeting_id);
CREATE INDEX idx_pc_status ON public.pastoral_care_entries(status);
CREATE INDEX idx_pc_assigned ON public.pastoral_care_entries(assigned_elder_id);
CREATE INDEX idx_archive_date ON public.elder_meeting_archive(meeting_date DESC);
CREATE INDEX idx_elder_meetings_date ON public.elder_meetings(meeting_date DESC);
