// Separate Supabase client connected to the Church Metrics project.
// Uses an isolated storage key so its session does not collide with the
// primary app session.
import { createClient } from "@supabase/supabase-js";

const METRICS_URL = "https://jrqwumvyafswleztawqq.supabase.co";
const METRICS_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpycXd1bXZ5YWZzd2xlenRhd3FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxOTY5MDUsImV4cCI6MjA4OTc3MjkwNX0.Ag_frSWqndScYSG-YLh06ovhLkk5v2DY3HZST9u9qyg";

export const metricsClient = createClient(METRICS_URL, METRICS_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    storageKey: "coah-metrics-auth",
    persistSession: true,
    autoRefreshToken: true,
  },
});

export type WeeklyMetric = {
  id: string;
  week_start_date: string;
  week_label: string | null;
  sanctuary_attendance: number | null;
  kids_attendance: number | null;
  total_attendance: number | null;
  internal_giving: number | null;
  community_group_attendance: number | null;
  volunteers_added: number | null;
  kids_volunteers: number | null;
  prayer_count: number | null;
  first_step_cards: number | null;
  next_step_cards: number | null;
  microsite_views: number | null;
  connect_qr_scans: number | null;
  is_special_sunday: boolean | null;
  special_sunday_type: string | null;
  service_canceled: boolean | null;
  cg_canceled: boolean | null;
  sermon_topic: string | null;
  notes: string | null;
};

export type MetricsHeadline = {
  avg_total_attendance?: number;
  avg_sanctuary?: number;
  avg_kids?: number;
  avg_weekly_giving?: number;
  avg_community_groups?: number;
  prayer_interactions?: number;
  first_step_cards?: number;
  next_step_cards?: number;
  qr_scans?: number;
  volunteers_added?: number;
  weeks: number;
};

function avg(nums: Array<number | null | undefined>): number | undefined {
  const xs = nums.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (!xs.length) return undefined;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function sum(nums: Array<number | null | undefined>): number | undefined {
  const xs = nums.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (!xs.length) return undefined;
  return xs.reduce((a, b) => a + b, 0);
}

export function summarizeWeeks(rows: WeeklyMetric[]): MetricsHeadline {
  const live = rows.filter((r) => !r.service_canceled);
  return {
    weeks: live.length,
    avg_total_attendance: avg(live.map((r) => r.total_attendance)),
    avg_sanctuary: avg(live.map((r) => r.sanctuary_attendance)),
    avg_kids: avg(live.map((r) => r.kids_attendance)),
    avg_weekly_giving: avg(live.map((r) => r.internal_giving)),
    avg_community_groups: avg(live.map((r) => r.community_group_attendance)),
    prayer_interactions: sum(live.map((r) => r.prayer_count)),
    first_step_cards: sum(live.map((r) => r.first_step_cards)),
    next_step_cards: sum(live.map((r) => r.next_step_cards)),
    qr_scans: sum(live.map((r) => r.connect_qr_scans)),
    volunteers_added: sum(live.map((r) => r.volunteers_added)),
  };
}

/** Fetch the most recent N weekly_metrics rows ordered by week_start_date desc. */
export async function fetchRecentWeeks(limit = 8): Promise<WeeklyMetric[]> {
  const { data, error } = await metricsClient
    .from("weekly_metrics")
    .select("*")
    .order("week_start_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as WeeklyMetric[];
}

/** Fetch weeks within an inclusive date range (YYYY-MM-DD). */
export async function fetchWeeksInRange(start: string, end: string): Promise<WeeklyMetric[]> {
  const { data, error } = await metricsClient
    .from("weekly_metrics")
    .select("*")
    .gte("week_start_date", start)
    .lte("week_start_date", end)
    .order("week_start_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as WeeklyMetric[];
}
