import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import { fetchCareList } from "@/server/pco.server";

export type PulseComponent = {
  key: string;
  label: string;
  score: number; // 0-100
  weight: number;
  detail: string;
  direction: "up" | "down" | "flat" | null;
};

export type PulseResult = {
  score: number; // 0-100
  components: PulseComponent[];
  weakest: string | null;
};

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

// Map a percent-change vs prior period into a 0-100 score. 0% change -> 70, +10% -> 95, -10% -> 45.
function trendScore(curr?: number | null, prev?: number | null): { score: number; dir: "up" | "down" | "flat" | null } {
  if (curr == null || prev == null || !Number.isFinite(curr) || !Number.isFinite(prev) || prev === 0) {
    return { score: 60, dir: null };
  }
  const pct = ((curr - prev) / prev) * 100;
  const dir = Math.abs(pct) < 1 ? "flat" : pct > 0 ? "up" : "down";
  return { score: clamp(70 + pct * 2.5), dir };
}

async function fetchWeeklyMetrics(): Promise<any[]> {
  const token = process.env.ANALYTICS_EXPORT_TOKEN;
  if (!token) return [];
  try {
    const res = await fetch(
      "https://jrqwumvyafswleztawqq.supabase.co/functions/v1/analytics-export?table=weekly_metrics",
      { headers: { "x-export-token": token } },
    );
    if (!res.ok) return [];
    const json = await res.json();
    const rows = (json.rows ?? []) as any[];
    rows.sort((a, b) => (a.week_start_date < b.week_start_date ? 1 : -1));
    return rows;
  } catch {
    return [];
  }
}

function avg(xs: Array<number | null | undefined>): number | null {
  const ns = xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (!ns.length) return null;
  return ns.reduce((a, b) => a + b, 0) / ns.length;
}

export const getCongregationPulse = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Role detection
    const { data: roleRows } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = (roleRows ?? []).map((r: any) => r.role as string);
    const hasElder = roles.includes("elder") || roles.includes("elder_candidate");

    const components: PulseComponent[] = [];

    // 1. Pastoral coverage (elders only)
    if (hasElder) {
      const { data: cfg } = await context.supabase
        .from("elder_pco_config")
        .select("list_id, assigned_elder_field_id, spiritual_health_field_id")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cfg?.list_id && cfg?.assigned_elder_field_id) {
        try {
          const people = await fetchCareList({
            list_id: cfg.list_id,
            field_ids: [cfg.assigned_elder_field_id],
          });
          const ids = people.map((p) => p.id);
          if (ids.length > 0) {
            const cutoff = new Date(Date.now() - 45 * 86400000).toISOString();
            const [{ data: tps }, { data: notes }] = await Promise.all([
              context.supabase.from("pco_touchpoints").select("pco_person_id").in("pco_person_id", ids).gte("created_at", cutoff),
              context.supabase.from("pco_pastoral_notes").select("pco_person_id").in("pco_person_id", ids).gte("created_at", cutoff),
            ]);
            const covered = new Set<string>();
            for (const r of (tps ?? []) as any[]) covered.add(r.pco_person_id);
            for (const r of (notes ?? []) as any[]) covered.add(r.pco_person_id);
            const pct = Math.round((covered.size / ids.length) * 100);
            components.push({
              key: "pastoral",
              label: "Pastoral coverage",
              score: pct,
              weight: 40,
              detail: `${covered.size} of ${ids.length} contacted in last 45 days`,
              direction: null,
            });
          }
        } catch {/* ignore PCO errors */}
      }
    }

    // 2-5. Metrics-based trends
    const rows = await fetchWeeklyMetrics();
    const live = rows.filter((r) => !r.service_canceled);
    const last4 = live.slice(0, 4);
    const prev4 = live.slice(4, 8);
    if (last4.length && prev4.length) {
      const att = trendScore(avg(last4.map((r) => r.total_attendance)), avg(prev4.map((r) => r.total_attendance)));
      components.push({
        key: "attendance", label: "Attendance trend", score: Math.round(att.score), weight: 20,
        detail: "Last 4 weeks vs prior 4", direction: att.dir,
      });
      const cg = trendScore(avg(last4.map((r) => r.community_group_attendance)), avg(prev4.map((r) => r.community_group_attendance)));
      components.push({
        key: "cg", label: "Community groups", score: Math.round(cg.score), weight: 15,
        detail: "Last 4 weeks vs prior 4", direction: cg.dir,
      });
      const giv = trendScore(avg(last4.map((r) => r.internal_giving)), avg(prev4.map((r) => r.internal_giving)));
      components.push({
        key: "giving", label: "Giving trend", score: Math.round(giv.score), weight: 15,
        detail: "Last 4 weeks vs prior 4", direction: giv.dir,
      });
      const sumN = (xs: any[], k: string) => xs.reduce((a, b) => a + (Number(b[k]) || 0), 0);
      const stepsCurr = sumN(last4, "first_step_cards") + sumN(last4, "next_step_cards");
      const stepsPrev = sumN(prev4, "first_step_cards") + sumN(prev4, "next_step_cards");
      const steps = trendScore(stepsCurr, stepsPrev);
      components.push({
        key: "steps", label: "Engagement cards", score: Math.round(steps.score), weight: 10,
        detail: `${stepsCurr} cards vs ${stepsPrev} prior`, direction: steps.dir,
      });
    }

    if (!components.length) {
      return { score: 0, components: [], weakest: null } as PulseResult;
    }

    // If pastoral component missing, redistribute its weight proportionally.
    const totalWeight = components.reduce((s, c) => s + c.weight, 0);
    const weighted = components.reduce((s, c) => s + c.score * c.weight, 0);
    const score = Math.round(weighted / totalWeight);
    const weakest = [...components].sort((a, b) => a.score - b.score)[0]?.label ?? null;
    return { score, components, weakest } as PulseResult;
  });
