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
          uploaded_by?: string | null
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
      mission_trips: {
        Row: {
          church_name: string
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
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
    }
    Enums: {
      app_role: "core" | "meeting" | "extended"
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
      app_role: ["core", "meeting", "extended"],
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
