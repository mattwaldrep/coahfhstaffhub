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
          source_checklist_item_id: string | null
          source_event_id: string | null
          source_issue_external_id: string | null
          source_onboarding_task_id: string | null
          source_workflow_id: string | null
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
          source_checklist_item_id?: string | null
          source_event_id?: string | null
          source_issue_external_id?: string | null
          source_onboarding_task_id?: string | null
          source_workflow_id?: string | null
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
          source_checklist_item_id?: string | null
          source_event_id?: string | null
          source_issue_external_id?: string | null
          source_onboarding_task_id?: string | null
          source_workflow_id?: string | null
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
          account_code: string | null
          annual_budget: number
          classification: string
          created_at: string
          fiscal_year: number
          id: string
          is_below_the_line: boolean | null
          is_rollup: boolean | null
          kind: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          account_code?: string | null
          annual_budget?: number
          classification?: string
          created_at?: string
          fiscal_year: number
          id?: string
          is_below_the_line?: boolean | null
          is_rollup?: boolean | null
          kind?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          account_code?: string | null
          annual_budget?: number
          classification?: string
          created_at?: string
          fiscal_year?: number
          id?: string
          is_below_the_line?: boolean | null
          is_rollup?: boolean | null
          kind?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      calendar_event_categories: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          action_note: string | null
          all_day: boolean
          category: string | null
          childcare_arranged: boolean
          childcare_needed: boolean
          church_covering: string | null
          class_series_id: string | null
          created_at: string
          created_by: string | null
          day_of_plan: string | null
          description: string | null
          end_at: string | null
          excluded_dates: string[]
          id: string
          leader_id: string | null
          leader_name: string | null
          leader_not_needed: boolean
          location: string | null
          mission_trip_id: string | null
          missions_team_needed: boolean
          multi_day_mode: string
          other_listings: string[]
          pco_registration: boolean
          readiness: Database["public"]["Enums"]["readiness"] | null
          recurrence_end_date: string | null
          room_approval_received: boolean
          room_needed: string | null
          room_not_needed: boolean
          room_request_submitted: boolean
          rrule: string | null
          social_ads: boolean
          start_at: string
          sub_calendar: Database["public"]["Enums"]["sub_calendar"]
          title: string
          updated_at: string
        }
        Insert: {
          action_note?: string | null
          all_day?: boolean
          category?: string | null
          childcare_arranged?: boolean
          childcare_needed?: boolean
          church_covering?: string | null
          class_series_id?: string | null
          created_at?: string
          created_by?: string | null
          day_of_plan?: string | null
          description?: string | null
          end_at?: string | null
          excluded_dates?: string[]
          id?: string
          leader_id?: string | null
          leader_name?: string | null
          leader_not_needed?: boolean
          location?: string | null
          mission_trip_id?: string | null
          missions_team_needed?: boolean
          multi_day_mode?: string
          other_listings?: string[]
          pco_registration?: boolean
          readiness?: Database["public"]["Enums"]["readiness"] | null
          recurrence_end_date?: string | null
          room_approval_received?: boolean
          room_needed?: string | null
          room_not_needed?: boolean
          room_request_submitted?: boolean
          rrule?: string | null
          social_ads?: boolean
          start_at: string
          sub_calendar?: Database["public"]["Enums"]["sub_calendar"]
          title: string
          updated_at?: string
        }
        Update: {
          action_note?: string | null
          all_day?: boolean
          category?: string | null
          childcare_arranged?: boolean
          childcare_needed?: boolean
          church_covering?: string | null
          class_series_id?: string | null
          created_at?: string
          created_by?: string | null
          day_of_plan?: string | null
          description?: string | null
          end_at?: string | null
          excluded_dates?: string[]
          id?: string
          leader_id?: string | null
          leader_name?: string | null
          leader_not_needed?: boolean
          location?: string | null
          mission_trip_id?: string | null
          missions_team_needed?: boolean
          multi_day_mode?: string
          other_listings?: string[]
          pco_registration?: boolean
          readiness?: Database["public"]["Enums"]["readiness"] | null
          recurrence_end_date?: string | null
          room_approval_received?: boolean
          room_needed?: string | null
          room_not_needed?: boolean
          room_request_submitted?: boolean
          rrule?: string | null
          social_ads?: boolean
          start_at?: string
          sub_calendar?: Database["public"]["Enums"]["sub_calendar"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_class_series_id_fkey"
            columns: ["class_series_id"]
            isOneToOne: false
            referencedRelation: "class_series"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "calendar_events_mission_trip_id_fkey"
            columns: ["mission_trip_id"]
            isOneToOne: false
            referencedRelation: "mission_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_plan_submissions: {
        Row: {
          created_at: string
          cycle_id: string
          id: string
          leader_id: string
          reviewed_at: string | null
          reviewer_id: string | null
          reviewer_note: string | null
          status: Database["public"]["Enums"]["plan_submission_status"]
          sub_calendar: Database["public"]["Enums"]["sub_calendar"]
          submitted_at: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          cycle_id: string
          id?: string
          leader_id: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_note?: string | null
          status?: Database["public"]["Enums"]["plan_submission_status"]
          sub_calendar: Database["public"]["Enums"]["sub_calendar"]
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          cycle_id?: string
          id?: string
          leader_id?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_note?: string | null
          status?: Database["public"]["Enums"]["plan_submission_status"]
          sub_calendar?: Database["public"]["Enums"]["sub_calendar"]
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_plan_submissions_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "calendar_planning_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_plan_submissions_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_plan_submissions_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_planning_cycles: {
        Row: {
          closes_at: string
          created_at: string
          created_by: string | null
          id: string
          opens_at: string
          plan_year: number
          status: Database["public"]["Enums"]["planning_cycle_status"]
          title: string
          updated_at: string
        }
        Insert: {
          closes_at: string
          created_at?: string
          created_by?: string | null
          id?: string
          opens_at: string
          plan_year: number
          status?: Database["public"]["Enums"]["planning_cycle_status"]
          title: string
          updated_at?: string
        }
        Update: {
          closes_at?: string
          created_at?: string
          created_by?: string | null
          id?: string
          opens_at?: string
          plan_year?: number
          status?: Database["public"]["Enums"]["planning_cycle_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_planning_cycles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_proposed_events: {
        Row: {
          action_note: string | null
          all_day: boolean
          approved_event_id: string | null
          category: string | null
          church_covering: string | null
          created_at: string
          description: string | null
          end_at: string | null
          id: string
          leader_name: string | null
          leader_not_needed: boolean
          location: string | null
          missions_team_needed: boolean
          other_listings: string[]
          pco_registration: boolean
          reviewer_note: string | null
          room_needed: string | null
          room_not_needed: boolean
          social_ads: boolean
          start_at: string
          status: Database["public"]["Enums"]["proposed_event_status"]
          sub_calendar: Database["public"]["Enums"]["sub_calendar"]
          submission_id: string
          title: string
          updated_at: string
        }
        Insert: {
          action_note?: string | null
          all_day?: boolean
          approved_event_id?: string | null
          category?: string | null
          church_covering?: string | null
          created_at?: string
          description?: string | null
          end_at?: string | null
          id?: string
          leader_name?: string | null
          leader_not_needed?: boolean
          location?: string | null
          missions_team_needed?: boolean
          other_listings?: string[]
          pco_registration?: boolean
          reviewer_note?: string | null
          room_needed?: string | null
          room_not_needed?: boolean
          social_ads?: boolean
          start_at: string
          status?: Database["public"]["Enums"]["proposed_event_status"]
          sub_calendar: Database["public"]["Enums"]["sub_calendar"]
          submission_id: string
          title: string
          updated_at?: string
        }
        Update: {
          action_note?: string | null
          all_day?: boolean
          approved_event_id?: string | null
          category?: string | null
          church_covering?: string | null
          created_at?: string
          description?: string | null
          end_at?: string | null
          id?: string
          leader_name?: string | null
          leader_not_needed?: boolean
          location?: string | null
          missions_team_needed?: boolean
          other_listings?: string[]
          pco_registration?: boolean
          reviewer_note?: string | null
          room_needed?: string | null
          room_not_needed?: boolean
          social_ads?: boolean
          start_at?: string
          status?: Database["public"]["Enums"]["proposed_event_status"]
          sub_calendar?: Database["public"]["Enums"]["sub_calendar"]
          submission_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_proposed_events_approved_event_id_fkey"
            columns: ["approved_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_proposed_events_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "calendar_plan_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      cg_coach_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          coach_user_id: string | null
          group_id: string
          group_name: string | null
          id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          coach_user_id?: string | null
          group_id: string
          group_name?: string | null
          id?: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          coach_user_id?: string | null
          group_id?: string
          group_name?: string | null
          id?: string
        }
        Relationships: []
      }
      cg_pco_config: {
        Row: {
          group_type_id: string | null
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          group_type_id?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          group_type_id?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      cg_touchpoints: {
        Row: {
          created_at: string
          group_id: string
          group_name: string | null
          id: string
          kind: string
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          group_name?: string | null
          id?: string
          kind: string
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          group_name?: string | null
          id?: string
          kind?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      checklist_template_items: {
        Row: {
          created_at: string
          id: string
          label: string
          position: number
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          position?: number
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          position?: number
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      class_series: {
        Row: {
          active: boolean
          bysetpos: number | null
          byweekday: string[]
          calendar_event_id: string | null
          created_at: string
          created_by: string | null
          default_childcare_needed: boolean
          default_leader_name: string | null
          default_room_id: string | null
          default_teacher_name: string | null
          end_date: string | null
          end_time: string | null
          excluded_dates: string[]
          freq: string
          id: string
          interval: number
          name: string
          start_date: string | null
          start_time: string | null
          updated_at: string
          weekday: number
        }
        Insert: {
          active?: boolean
          bysetpos?: number | null
          byweekday?: string[]
          calendar_event_id?: string | null
          created_at?: string
          created_by?: string | null
          default_childcare_needed?: boolean
          default_leader_name?: string | null
          default_room_id?: string | null
          default_teacher_name?: string | null
          end_date?: string | null
          end_time?: string | null
          excluded_dates?: string[]
          freq?: string
          id?: string
          interval?: number
          name: string
          start_date?: string | null
          start_time?: string | null
          updated_at?: string
          weekday: number
        }
        Update: {
          active?: boolean
          bysetpos?: number | null
          byweekday?: string[]
          calendar_event_id?: string | null
          created_at?: string
          created_by?: string | null
          default_childcare_needed?: boolean
          default_leader_name?: string | null
          default_room_id?: string | null
          default_teacher_name?: string | null
          end_date?: string | null
          end_time?: string | null
          excluded_dates?: string[]
          freq?: string
          id?: string
          interval?: number
          name?: string
          start_date?: string | null
          start_time?: string | null
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "class_series_default_room_id_fkey"
            columns: ["default_room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      comms_channel_managers: {
        Row: {
          channel_key: string
          created_at: string
          manager_id: string | null
          updated_at: string
        }
        Insert: {
          channel_key: string
          created_at?: string
          manager_id?: string | null
          updated_at?: string
        }
        Update: {
          channel_key?: string
          created_at?: string
          manager_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comms_channel_managers_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          meeting_id: string | null
          motion_text: string | null
          notes: string | null
          outcome: string
          title: string
          updated_at: string
          vote_abstain: number
          vote_no: number
          vote_yes: number
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          meeting_id?: string | null
          motion_text?: string | null
          notes?: string | null
          outcome?: string
          title: string
          updated_at?: string
          vote_abstain?: number
          vote_no?: number
          vote_yes?: number
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          meeting_id?: string | null
          motion_text?: string | null
          notes?: string | null
          outcome?: string
          title?: string
          updated_at?: string
          vote_abstain?: number
          vote_no?: number
          vote_yes?: number
        }
        Relationships: [
          {
            foreignKeyName: "decisions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
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
          carry_to_next: boolean
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
          carry_to_next?: boolean
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
          carry_to_next?: boolean
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
      elder_motion_votes: {
        Row: {
          choice: Database["public"]["Enums"]["elder_motion_choice"]
          comment: string | null
          id: string
          motion_id: string
          updated_at: string
          voted_at: string
          voter_id: string
        }
        Insert: {
          choice: Database["public"]["Enums"]["elder_motion_choice"]
          comment?: string | null
          id?: string
          motion_id: string
          updated_at?: string
          voted_at?: string
          voter_id: string
        }
        Update: {
          choice?: Database["public"]["Enums"]["elder_motion_choice"]
          comment?: string | null
          id?: string
          motion_id?: string
          updated_at?: string
          voted_at?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "elder_motion_votes_motion_id_fkey"
            columns: ["motion_id"]
            isOneToOne: false
            referencedRelation: "elder_motions"
            referencedColumns: ["id"]
          },
        ]
      }
      elder_motions: {
        Row: {
          close_notified_at: string | null
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string
          deadline_at: string
          description: string | null
          id: string
          open_notified_at: string | null
          outcome: Database["public"]["Enums"]["elder_motion_outcome"]
          tally_abstain: number
          tally_no: number
          tally_yes: number
          title: string
          updated_at: string
        }
        Insert: {
          close_notified_at?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by: string
          deadline_at: string
          description?: string | null
          id?: string
          open_notified_at?: string | null
          outcome?: Database["public"]["Enums"]["elder_motion_outcome"]
          tally_abstain?: number
          tally_no?: number
          tally_yes?: number
          title: string
          updated_at?: string
        }
        Update: {
          close_notified_at?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string
          deadline_at?: string
          description?: string | null
          id?: string
          open_notified_at?: string | null
          outcome?: Database["public"]["Enums"]["elder_motion_outcome"]
          tally_abstain?: number
          tally_no?: number
          tally_yes?: number
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
      elder_threshold_notifications: {
        Row: {
          last_notified_days: number
          notified_at: string
          pco_person_id: string
          threshold: number
        }
        Insert: {
          last_notified_days: number
          notified_at?: string
          pco_person_id: string
          threshold: number
        }
        Update: {
          last_notified_days?: number
          notified_at?: string
          pco_person_id?: string
          threshold?: number
        }
        Relationships: []
      }
      event_checklist_items: {
        Row: {
          action_item_id: string | null
          assignee_id: string | null
          created_at: string
          created_by: string | null
          done: boolean
          due_date: string | null
          event_id: string
          id: string
          label: string
          position: number
          updated_at: string
        }
        Insert: {
          action_item_id?: string | null
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          done?: boolean
          due_date?: string | null
          event_id: string
          id?: string
          label: string
          position?: number
          updated_at?: string
        }
        Update: {
          action_item_id?: string | null
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          done?: boolean
          due_date?: string | null
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
      event_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          event_id: string
          id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          event_id: string
          id?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          event_id?: string
          id?: string
        }
        Relationships: []
      }
      event_plan_templates: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_rooms: {
        Row: {
          approval_received: boolean
          created_at: string
          event_id: string
          id: string
          request_submitted: boolean
          room_id: string
        }
        Insert: {
          approval_received?: boolean
          created_at?: string
          event_id: string
          id?: string
          request_submitted?: boolean
          room_id: string
        }
        Update: {
          approval_received?: boolean
          created_at?: string
          event_id?: string
          id?: string
          request_submitted?: boolean
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_rooms_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rooms_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      event_sunday_slots: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          event_id: string | null
          id: string
          sunday_date: string
          text_label: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          sunday_date: string
          text_label?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          sunday_date?: string
          text_label?: string | null
        }
        Relationships: []
      }
      event_template_attachments: {
        Row: {
          created_at: string
          event_id: string
          id: string
          template_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          template_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_template_attachments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_template_attachments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      event_template_item_state: {
        Row: {
          created_at: string
          done: boolean
          event_id: string
          id: string
          occurrence_date: string
          template_item_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          event_id: string
          id?: string
          occurrence_date: string
          template_item_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          done?: boolean
          event_id?: string
          id?: string
          occurrence_date?: string
          template_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_template_item_state_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_template_item_state_template_item_id_fkey"
            columns: ["template_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_template_items"
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
          imported_at: string | null
          imported_by: string | null
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
          imported_at?: string | null
          imported_by?: string | null
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
          imported_at?: string | null
          imported_by?: string | null
          label?: string | null
          mime_type?: string | null
          month?: number
          parsed_metrics?: Json | null
          report_type?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      finance_snapshot_lines: {
        Row: {
          annual_budget: number | null
          category_id: string
          created_at: string
          id: string
          snapshot_id: string
          ytd_actual: number
          ytd_budget: number
        }
        Insert: {
          annual_budget?: number | null
          category_id: string
          created_at?: string
          id?: string
          snapshot_id: string
          ytd_actual?: number
          ytd_budget?: number
        }
        Update: {
          annual_budget?: number | null
          category_id?: string
          created_at?: string
          id?: string
          snapshot_id?: string
          ytd_actual?: number
          ytd_budget?: number
        }
        Relationships: [
          {
            foreignKeyName: "finance_snapshot_lines_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "budget_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_snapshot_lines_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "finance_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_snapshots: {
        Row: {
          as_of_month: number
          created_at: string
          created_by: string | null
          fiscal_year: number
          id: string
          notes: string | null
          source_report_id: string | null
          updated_at: string
        }
        Insert: {
          as_of_month: number
          created_at?: string
          created_by?: string | null
          fiscal_year: number
          id?: string
          notes?: string | null
          source_report_id?: string | null
          updated_at?: string
        }
        Update: {
          as_of_month?: number
          created_at?: string
          created_by?: string | null
          fiscal_year?: number
          id?: string
          notes?: string | null
          source_report_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_snapshots_source_report_id_fkey"
            columns: ["source_report_id"]
            isOneToOne: false
            referencedRelation: "finance_reports"
            referencedColumns: ["id"]
          },
        ]
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
          adults_count: number | null
          alternate_dates: string | null
          church_context: string | null
          church_name: string
          comms_preference: string | null
          confirm_checklist: Json
          coordinator_on_call_name: string | null
          coordinator_on_call_phone: string | null
          created_at: string
          created_by: string | null
          daily_window_end: string | null
          daily_window_start: string | null
          dietary_flags: string | null
          draft_itinerary: string | null
          end_date: string | null
          id: string
          inquiry_submitted_at: string | null
          inquiry_token: string
          itinerary_doc_id: string | null
          itinerary_doc_url: string | null
          itinerary_due_date: string | null
          itinerary_file_name: string | null
          itinerary_file_path: string | null
          itinerary_link: string | null
          itinerary_owner: string | null
          leader_email: string | null
          leader_name: string | null
          leader_phone: string | null
          lodging_status: string | null
          notes: string | null
          outreach_tracks: string[]
          planning_call_at: string | null
          planning_notes: Json
          position: number
          primary_focus: string | null
          skipped_steps: Json
          start_date: string | null
          status: Database["public"]["Enums"]["trip_status"]
          step_notes: Json
          steps: Json
          students_count: number | null
          team_headcount: number | null
          team_number: string | null
          transport_status: string | null
          updated_at: string
          vision: string | null
        }
        Insert: {
          adults_count?: number | null
          alternate_dates?: string | null
          church_context?: string | null
          church_name: string
          comms_preference?: string | null
          confirm_checklist?: Json
          coordinator_on_call_name?: string | null
          coordinator_on_call_phone?: string | null
          created_at?: string
          created_by?: string | null
          daily_window_end?: string | null
          daily_window_start?: string | null
          dietary_flags?: string | null
          draft_itinerary?: string | null
          end_date?: string | null
          id?: string
          inquiry_submitted_at?: string | null
          inquiry_token?: string
          itinerary_doc_id?: string | null
          itinerary_doc_url?: string | null
          itinerary_due_date?: string | null
          itinerary_file_name?: string | null
          itinerary_file_path?: string | null
          itinerary_link?: string | null
          itinerary_owner?: string | null
          leader_email?: string | null
          leader_name?: string | null
          leader_phone?: string | null
          lodging_status?: string | null
          notes?: string | null
          outreach_tracks?: string[]
          planning_call_at?: string | null
          planning_notes?: Json
          position?: number
          primary_focus?: string | null
          skipped_steps?: Json
          start_date?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
          step_notes?: Json
          steps?: Json
          students_count?: number | null
          team_headcount?: number | null
          team_number?: string | null
          transport_status?: string | null
          updated_at?: string
          vision?: string | null
        }
        Update: {
          adults_count?: number | null
          alternate_dates?: string | null
          church_context?: string | null
          church_name?: string
          comms_preference?: string | null
          confirm_checklist?: Json
          coordinator_on_call_name?: string | null
          coordinator_on_call_phone?: string | null
          created_at?: string
          created_by?: string | null
          daily_window_end?: string | null
          daily_window_start?: string | null
          dietary_flags?: string | null
          draft_itinerary?: string | null
          end_date?: string | null
          id?: string
          inquiry_submitted_at?: string | null
          inquiry_token?: string
          itinerary_doc_id?: string | null
          itinerary_doc_url?: string | null
          itinerary_due_date?: string | null
          itinerary_file_name?: string | null
          itinerary_file_path?: string | null
          itinerary_link?: string | null
          itinerary_owner?: string | null
          leader_email?: string | null
          leader_name?: string | null
          leader_phone?: string | null
          lodging_status?: string | null
          notes?: string | null
          outreach_tracks?: string[]
          planning_call_at?: string | null
          planning_notes?: Json
          position?: number
          primary_focus?: string | null
          skipped_steps?: Json
          start_date?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
          step_notes?: Json
          steps?: Json
          students_count?: number | null
          team_headcount?: number | null
          team_number?: string | null
          transport_status?: string | null
          updated_at?: string
          vision?: string | null
        }
        Relationships: []
      }
      oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          provider: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          provider: string
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          provider?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_task_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "onboarding_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_tasks: {
        Row: {
          action_item_id: string | null
          assignee_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          is_completed: boolean
          is_skipped: boolean
          parent_task_id: string | null
          section_name: string
          skipped_reason: string | null
          sort_order: number
          source_template_id: string | null
          task_name: string
          updated_at: string
          workflow_id: string
        }
        Insert: {
          action_item_id?: string | null
          assignee_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean
          is_skipped?: boolean
          parent_task_id?: string | null
          section_name: string
          skipped_reason?: string | null
          sort_order?: number
          source_template_id?: string | null
          task_name: string
          updated_at?: string
          workflow_id: string
        }
        Update: {
          action_item_id?: string | null
          assignee_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean
          is_skipped?: boolean
          parent_task_id?: string | null
          section_name?: string
          skipped_reason?: string | null
          sort_order?: number
          source_template_id?: string | null
          task_name?: string
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "onboarding_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_tasks_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "onboarding_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_onsite_only: boolean
          parent_id: string | null
          section_name: string
          sort_order: number
          task_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_onsite_only?: boolean
          parent_id?: string | null
          section_name: string
          sort_order?: number
          task_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_onsite_only?: boolean
          parent_id?: string | null
          section_name?: string
          sort_order?: number
          task_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_templates_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "onboarding_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_workflows: {
        Row: {
          created_at: string
          created_by: string | null
          hire_type: string
          id: string
          new_hire_email: string | null
          new_hire_name: string
          start_date: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          hire_type: string
          id?: string
          new_hire_email?: string | null
          new_hire_name: string
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          hire_type?: string
          id?: string
          new_hire_email?: string | null
          new_hire_name?: string
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
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
      pco_services_config: {
        Row: {
          id: boolean
          sunday_service_type_id: string | null
          updated_at: string
        }
        Insert: {
          id?: boolean
          sunday_service_type_id?: string | null
          updated_at?: string
        }
        Update: {
          id?: boolean
          sunday_service_type_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pco_touchpoints: {
        Row: {
          created_at: string
          id: string
          kind: string
          note: string | null
          pco_person_id: string
          person_name: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          note?: string | null
          pco_person_id: string
          person_name?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          note?: string | null
          pco_person_id?: string
          person_name?: string | null
          user_id?: string
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
      rooms: {
        Row: {
          active: boolean
          capacity: number | null
          created_at: string
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          capacity?: number | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          capacity?: number | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sunday_review_nudges: {
        Row: {
          active: boolean
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          section: string
          updated_at: string
          weekday_offset: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          section: string
          updated_at?: string
          weekday_offset?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          section?: string
          updated_at?: string
          weekday_offset?: number
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
      extract_finance_account_code: { Args: { _name: string }; Returns: string }
      has_any_elder_access: { Args: { _user_id: string }; Returns: boolean }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_deacon_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_cg_coach: { Args: { _user_id: string }; Returns: boolean }
      is_chair_of_deacons: { Args: { _user_id: string }; Returns: boolean }
      is_full_elder: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "core"
        | "meeting"
        | "extended"
        | "elder"
        | "elder_candidate"
        | "cg_coach"
        | "deacon"
        | "chair_of_deacons"
      elder_motion_choice: "yes" | "no" | "abstain"
      elder_motion_outcome: "open" | "passed" | "failed" | "tied"
      plan_submission_status:
        | "draft"
        | "submitted"
        | "in_review"
        | "approved"
        | "partially_approved"
        | "rejected"
      planning_cycle_status: "open" | "review" | "closed"
      proposed_event_status: "pending" | "approved" | "rejected"
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
      app_role: [
        "core",
        "meeting",
        "extended",
        "elder",
        "elder_candidate",
        "cg_coach",
        "deacon",
        "chair_of_deacons",
      ],
      elder_motion_choice: ["yes", "no", "abstain"],
      elder_motion_outcome: ["open", "passed", "failed", "tied"],
      plan_submission_status: [
        "draft",
        "submitted",
        "in_review",
        "approved",
        "partially_approved",
        "rejected",
      ],
      planning_cycle_status: ["open", "review", "closed"],
      proposed_event_status: ["pending", "approved", "rejected"],
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
