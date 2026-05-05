export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      action_items: {
        Row: {
          assignee_id: string | null
          completed: boolean
          created_at: string
          created_by: string | null
          due_date: string | null
          google_task_id: string | null
          google_task_pushed_at: string | null
          google_task_pushed_by: string | null
          id: string
          meeting_id: string | null
          notes: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          completed?: boolean
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          google_task_id?: string | null
          google_task_pushed_at?: string | null
          google_task_pushed_by?: string | null
          id?: string
          meeting_id?: string | null
          notes?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          completed?: boolean
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          google_task_id?: string | null
          google_task_pushed_at?: string | null
          google_task_pushed_by?: string | null
          id?: string
          meeting_id?: string | null
          notes?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_items_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_items_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_items: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          meeting_id: string
          notes: string | null
          owner_id: string | null
          owner_name: string | null
          position: number
          source: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          meeting_id: string
          notes?: string | null
          owner_id?: string | null
          owner_name?: string | null
          position?: number
          source?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          meeting_id?: string
          notes?: string | null
          owner_id?: string | null
          owner_name?: string | null
          position?: number
          source?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      budget_actuals: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          fiscal_year: number
          id: string
          month: number
          notes: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          category_id: string
          created_at?: string
          fiscal_year: number
          id?: string
          month: number
          notes?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          fiscal_year?: number
          id?: string
          month?: number
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_actuals_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "budget_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_categories: {
        Row: {
          annual_budget: number
          created_at: string
          fiscal_year: number
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          annual_budget?: number
          created_at?: string
          fiscal_year: number
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          annual_budget?: number
          created_at?: string
          fiscal_year?: number
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          all_day: boolean
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_at: string | null
          excluded_dates: string[]
          id: string
          leader_id: string | null
          leader_name: string | null
          location: string | null
          pco_registration: boolean
          readiness: Database["public"]["Enums"]["readiness"] | null
          recurrence_end_date: string | null
          rrule: string | null
          start_at: string
          sub_calendar: Database["public"]["Enums"]["sub_calendar"]
          title: string
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_at?: string | null
          excluded_dates?: string[]
          id?: string
          leader_id?: string | null
          leader_name?: string | null
          location?: string | null
          pco_registration?: boolean
          readiness?: Database["public"]["Enums"]["readiness"] | null
          recurrence_end_date?: string | null
          rrule?: string | null
          start_at: string
          sub_calendar?: Database["public"]["Enums"]["sub_calendar"]
          title: string
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_at?: string | null
          excluded_dates?: string[]
          id?: string
          leader_id?: string | null
          leader_name?: string | null
          location?: string | null
          pco_registration?: boolean
          readiness?: Database["public"]["Enums"]["readiness"] | null
          recurrence_end_date?: string | null
          rrule?: string | null
          start_at?: string
          sub_calendar?: Database["public"]["Enums"]["sub_calendar"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      elder_action_items: {
        Row: {
          assignee_id: string | null
          completed: boolean
          created_at: string
          created_by: string | null
          due_date: string | null
          executive_session: boolean
          google_task_id: string | null
          google_task_pushed_at: string | null
          google_task_pushed_by: string | null
          id: string
          meeting_id: string | null
          notes: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          completed?: boolean
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          executive_session?: boolean
          google_task_id?: string | null
          google_task_pushed_at?: string | null
          google_task_pushed_by?: string | null
          id?: string
          meeting_id?: string | null
          notes?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          completed?: boolean
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          executive_session?: boolean
          google_task_id?: string | null
          google_task_pushed_at?: string | null
          google_task_pushed_by?: string | null
          id?: string
          meeting_id?: string | null
          notes?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "elder_action_items_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "elder_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      elder_agenda_items: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          executive_session: boolean
          id: string
          meeting_id: string
          owner_id: string | null
          position: number
          section_key: string
          source: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          executive_session?: boolean
          id?: string
          meeting_id: string
          owner_id?: string | null
          position?: number
          section_key: string
          source?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          executive_session?: boolean
          id?: string
          meeting_id?: string
          owner_id?: string | null
          position?: number
          section_key?: string
          source?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "elder_agenda_items_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "elder_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      elder_email_settings: {
        Row: {
          briefing_enabled: boolean
          briefing_send_hour: number
          id: string
          recap_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          briefing_enabled?: boolean
          briefing_send_hour?: number
          id?: string
          recap_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          briefing_enabled?: boolean
          briefing_send_hour?: number
          id?: string
          recap_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      elder_joint_deacon_items: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          executive_session: boolean
          id: string
          meeting_id: string
          position: number
          sub_section: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          executive_session?: boolean
          id?: string
          meeting_id: string
          position?: number
          sub_section: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          executive_session?: boolean
          id?: string
          meeting_id?: string
          position?: number
          sub_section?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "elder_joint_deacon_items_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "elder_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      elder_meeting_archive: {
        Row: {
          action_items: Json
          agenda: Json
          attendees: Json
          created_at: string
          id: string
          imported_by: string | null
          meeting_date: string
          meeting_type: string
          raw_text: string | null
          source_url: string | null
          title: string | null
        }
        Insert: {
          action_items?: Json
          agenda?: Json
          attendees?: Json
          created_at?: string
          id?: string
          imported_by?: string | null
          meeting_date: string
          meeting_type?: string
          raw_text?: string | null
          source_url?: string | null
          title?: string | null
        }
        Update: {
          action_items?: Json
          agenda?: Json
          attendees?: Json
          created_at?: string
          id?: string
          imported_by?: string | null
          meeting_date?: string
          meeting_type?: string
          raw_text?: string | null
          source_url?: string | null
          title?: string | null
        }
        Relationships: []
      }
      elder_meeting_attendees: {
        Row: {
          attendee_kind: string
          created_at: string
          id: string
          meeting_id: string
          present: boolean
          user_id: string
        }
        Insert: {
          attendee_kind: string
          created_at?: string
          id?: string
          meeting_id: string
          present?: boolean
          user_id: string
        }
        Update: {
          attendee_kind?: string
          created_at?: string
          id?: string
          meeting_id?: string
          present?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "elder_meeting_attendees_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "elder_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      elder_meetings: {
        Row: {
          agenda: Json
          briefing_sent_at: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          location: string | null
          meeting_date: string
          meeting_type: string
          notes: string | null
          recap_sent_at: string | null
          start_time: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          agenda?: Json
          briefing_sent_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          meeting_date: string
          meeting_type?: string
          notes?: string | null
          recap_sent_at?: string | null
          start_time?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          agenda?: Json
          briefing_sent_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          meeting_date?: string
          meeting_type?: string
          notes?: string | null
          recap_sent_at?: string | null
          start_time?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      elder_next_meeting_seed: {
        Row: {
          body: string | null
          consumed_meeting_id: string | null
          created_at: string
          created_by: string | null
          executive_session: boolean
          id: string
          section_key: string
          title: string
        }
        Insert: {
          body?: string | null
          consumed_meeting_id?: string | null
          created_at?: string
          created_by?: string | null
          executive_session?: boolean
          id?: string
          section_key?: string
          title: string
        }
        Update: {
          body?: string | null
          consumed_meeting_id?: string | null
          created_at?: string
          created_by?: string | null
          executive_session?: boolean
          id?: string
          section_key?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "elder_next_meeting_seed_consumed_meeting_id_fkey"
            columns: ["consumed_meeting_id"]
            isOneToOne: false
            referencedRelation: "elder_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      elder_pco_config: {
        Row: {
          assigned_elder_field_id: string | null
          id: string
          list_id: string | null
          spiritual_health_field_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assigned_elder_field_id?: string | null
          id?: string
          list_id?: string | null
          spiritual_health_field_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assigned_elder_field_id?: string | null
          id?: string
          list_id?: string | null
          spiritual_health_field_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      elder_section_notes: {
        Row: {
          created_at: string
          executive_session: boolean
          id: string
          meeting_id: string
          notes: string | null
          section_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          executive_session?: boolean
          id?: string
          meeting_id: string
          notes?: string | null
          section_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          executive_session?: boolean
          id?: string
          meeting_id?: string
          notes?: string | null
          section_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "elder_section_notes_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "elder_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      event_checklist_items: {
        Row: {
          created_at: string
          done: boolean
          event_id: string
          id: string
          label: string
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          event_id: string
          id?: string
          label: string
          position?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          done?: boolean
          event_id?: string
          id?: string
          label?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_checklist_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_reports: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          fiscal_year: number
          id: string
          label: string | null
          mime_type: string | null
          month: number
          parsed_metrics: Json | null
          report_type: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          fiscal_year: number
          id?: string
          label?: string | null
          mime_type?: string | null
          month: number
          parsed_metrics?: Json | null
          report_type?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          fiscal_year?: number
          id?: string
          label?: string | null
          mime_type?: string | null
          month?: number
          parsed_metrics?: Json | null
          report_type?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      meeting_event_notes: {
        Row: {
          created_at: string
          event_id: string
          id: string
          meeting_id: string
          notes: string | null
          occurrence_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          meeting_id: string
          notes?: string | null
          occurrence_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          meeting_id?: string
          notes?: string | null
          occurrence_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      meeting_section_notes: {
        Row: {
          created_at: string
          id: string
          meeting_id: string
          notes: string | null
          section_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          meeting_id: string
          notes?: string | null
          section_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          meeting_id?: string
          notes?: string | null
          section_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      meetings: {
        Row: {
          agenda: Json
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          meeting_date: string
          notes: string | null
          recap_sent_at: string | null
          status: string
          title: string
          transcript: string | null
          updated_at: string
        }
        Insert: {
          agenda?: Json
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          meeting_date: string
          notes?: string | null
          recap_sent_at?: string | null
          status?: string
          title?: string
          transcript?: string | null
          updated_at?: string
        }
        Update: {
          agenda?: Json
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          meeting_date?: string
          notes?: string | null
          recap_sent_at?: string | null
          status?: string
          title?: string
          transcript?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_interviews: {
        Row: {
          archived: boolean
          assigned_elder_ids: string[]
          candidate_name: string
          created_at: string
          created_by: string | null
          executive_session: boolean
          id: string
          notes: string | null
          scheduled_for: string | null
          status: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          assigned_elder_ids?: string[]
          candidate_name: string
          created_at?: string
          created_by?: string | null
          executive_session?: boolean
          id?: string
          notes?: string | null
          scheduled_for?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          assigned_elder_ids?: string[]
          candidate_name?: string
          created_at?: string
          created_by?: string | null
          executive_session?: boolean
          id?: string
          notes?: string | null
          scheduled_for?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      membership_followups: {
        Row: {
          assigned_elder_id: string | null
          created_at: string
          created_by: string | null
          executive_session: boolean
          id: string
          last_contact_date: string | null
          notes: string | null
          person_name: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_elder_id?: string | null
          created_at?: string
          created_by?: string | null
          executive_session?: boolean
          id?: string
          last_contact_date?: string | null
          notes?: string | null
          person_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_elder_id?: string | null
          created_at?: string
          created_by?: string | null
          executive_session?: boolean
          id?: string
          last_contact_date?: string | null
          notes?: string | null
          person_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      mission_trips: {
        Row: {
          church_name: string
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          itinerary_file_name: string | null
          itinerary_file_path: string | null
          itinerary_link: string | null
          leader_email: string | null
          leader_name: string | null
          leader_phone: string | null
          notes: string | null
          position: number
          primary_focus: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["trip_status"]
          steps: Json
          team_number: string | null
          updated_at: string
        }
        Insert: {
          church_name: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          itinerary_file_name?: string | null
          itinerary_file_path?: string | null
          itinerary_link?: string | null
          leader_email?: string | null
          leader_name?: string | null
          leader_phone?: string | null
          notes?: string | null
          position?: number
          primary_focus?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
          steps?: Json
          team_number?: string | null
          updated_at?: string
        }
        Update: {
          church_name?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          itinerary_file_name?: string | null
          itinerary_file_path?: string | null
          itinerary_link?: string | null
          leader_email?: string | null
          leader_name?: string | null
          leader_phone?: string | null
          notes?: string | null
          position?: number
          primary_focus?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
          steps?: Json
          team_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pco_pastoral_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          executive_session: boolean
          id: string
          meeting_id: string | null
          pco_person_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          executive_session?: boolean
          id?: string
          meeting_id?: string | null
          pco_person_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          executive_session?: boolean
          id?: string
          meeting_id?: string | null
          pco_person_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sunday_reviews: {
        Row: {
          confession_notes: string | null
          confession_rating: number | null
          connect_notes: string | null
          connect_rating: number | null
          created_at: string
          id: string
          opportunities: string | null
          sermon_notes: string | null
          sermon_rating: number | null
          service_date: string
          submitted_by: string | null
          updated_at: string
          wins: string | null
          worship_notes: string | null
          worship_rating: number | null
        }
        Insert: {
          confession_notes?: string | null
          confession_rating?: number | null
          connect_notes?: string | null
          connect_rating?: number | null
          created_at?: string
          id?: string
          opportunities?: string | null
          sermon_notes?: string | null
          sermon_rating?: number | null
          service_date: string
          submitted_by?: string | null
          updated_at?: string
          wins?: string | null
          worship_notes?: string | null
          worship_rating?: number | null
        }
        Update: {
          confession_notes?: string | null
          confession_rating?: number | null
          connect_notes?: string | null
          connect_rating?: number | null
          created_at?: string
          id?: string
          opportunities?: string | null
          sermon_notes?: string | null
          sermon_rating?: number | null
          service_date?: string
          submitted_by?: string | null
          updated_at?: string
          wins?: string | null
          worship_notes?: string | null
          worship_rating?: number | null
        }
        Relationships: []
      }
      user_integrations: {
        Row: {
          access_token: string | null
          auto_push: boolean
          created_at: string
          expires_at: string | null
          id: string
          provider: string
          refresh_token: string
          scope: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          auto_push?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          provider: string
          refresh_token: string
          scope?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          auto_push?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          provider?: string
          refresh_token?: string
          scope?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_any_elder_access: { Args: { _user_id: string }; Returns: boolean }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_full_elder: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "core" | "meeting" | "extended" | "elder" | "elder_candidate"
      readiness: "green" | "yellow" | "red"
      sub_calendar: "forest_hills_main" | "coah_lm" | "youth" | "general"
      trip_status:
        | "not_started"
        | "tbc"
        | "pre_trip"
        | "in_field"
        | "complete"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["core", "meeting", "extended", "elder", "elder_candidate"],
      readiness: ["green", "yellow", "red"],
      sub_calendar: ["forest_hills_main", "coah_lm", "youth", "general"],
      trip_status: [
        "not_started",
        "tbc",
        "pre_trip",
        "in_field",
        "complete",
        "cancelled",
      ],
    },
  },
} as const
