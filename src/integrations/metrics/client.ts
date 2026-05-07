// Metrics data is now served via a server function backed by an authenticated
// HTTP export endpoint, so individual users no longer need to sign in.
import { getWeeklyMetrics } from "@/lib/metrics.functions";

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

let cache: { at: number; rows: WeeklyMetric[] } | null = null;
const CACHE_MS = 5 * 60_000;

async function getAll(): Promise<WeeklyMetric[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  const rows = (await getWeeklyMetrics()) as WeeklyMetric[];
  cache = { at: Date.now(), rows };
  return rows;
}

/** Fetch the most recent N weekly_metrics rows ordered by week_start_date desc. */
export async function fetchRecentWeeks(limit = 8): Promise<WeeklyMetric[]> {
  const rows = await getAll();
  return rows.slice(0, limit);
}

/** Fetch weeks within an inclusive date range (YYYY-MM-DD). */
export async function fetchWeeksInRange(start: string, end: string): Promise<WeeklyMetric[]> {
  const rows = await getAll();
  return rows.filter((r) => r.week_start_date >= start && r.week_start_date <= end);
}
