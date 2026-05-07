import { createServerFn } from "@tanstack/react-start";

const EXPORT_URL =
  "https://jrqwumvyafswleztawqq.supabase.co/functions/v1/analytics-export";

export type WeeklyMetricRow = {
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

async function fetchTable<T>(table: string): Promise<T[]> {
  const token = process.env.ANALYTICS_EXPORT_TOKEN;
  if (!token) throw new Error("ANALYTICS_EXPORT_TOKEN is not configured");
  const res = await fetch(`${EXPORT_URL}?table=${encodeURIComponent(table)}`, {
    headers: { "x-export-token": token },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`analytics-export ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return (json.rows ?? []) as T[];
}

export const getWeeklyMetrics = createServerFn({ method: "GET" }).handler(
  async () => {
    const rows = await fetchTable<WeeklyMetricRow>("weekly_metrics");
    rows.sort((a, b) => (a.week_start_date < b.week_start_date ? 1 : -1));
    return rows;
  },
);

export const getMilestones = createServerFn({ method: "GET" }).handler(
  async () => fetchTable<Record<string, any>>("milestones"),
);
export const getEventAttendance = createServerFn({ method: "GET" }).handler(
  async () => fetchTable<Record<string, any>>("event_attendance"),
);
export const getGoals = createServerFn({ method: "GET" }).handler(
  async () => fetchTable<Record<string, any>>("goals"),
);
export const getBaselines = createServerFn({ method: "GET" }).handler(
  async () => fetchTable<Record<string, any>>("baselines"),
);
export const getChartAnnotations = createServerFn({ method: "GET" }).handler(
  async () => fetchTable<Record<string, any>>("chart_annotations"),
);
