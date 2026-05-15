import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PublicEventRow = {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  sub_calendar: string;
  leader_name: string | null;
  location: string | null;
  all_day: boolean;
  category: string | null;
  rrule: string | null;
  recurrence_end_date: string | null;
  excluded_dates: string[];
  other_listings: string[];
};

export const getPublicEvents = createServerFn({ method: "GET" })
  .inputValidator((data: { rangeStart: string; rangeEnd: string }) => data)
  .handler(async ({ data }): Promise<{ events: PublicEventRow[]; error: string | null }> => {
    try {
      const { data: rows, error } = await supabaseAdmin
        .from("calendar_events")
        .select(
          "id,title,description,start_at,end_at,sub_calendar,leader_name,location,all_day,category,rrule,recurrence_end_date,excluded_dates,other_listings",
        )
        .or(
          `and(start_at.gte.${data.rangeStart},start_at.lte.${data.rangeEnd}),rrule.not.is.null`,
        )
        .order("start_at", { ascending: true });

      if (error) {
        console.error("getPublicEvents error:", error);
        return { events: [], error: "Failed to load events" };
      }
      return { events: (rows ?? []) as PublicEventRow[], error: null };
    } catch (e) {
      console.error("getPublicEvents threw:", e);
      return { events: [], error: "Calendar service unavailable" };
    }
  });
