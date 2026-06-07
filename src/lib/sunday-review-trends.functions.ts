import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";

export type SectionKey = "worship" | "confession" | "connect" | "sermon";

export type TrendPoint = { date: string; rolling_avg: number | null; raw_avg: number | null };

export type WorshipTrends = {
  sections: Record<SectionKey, TrendPoint[]>;
  current: Record<SectionKey, number | null>;
  delta6w: Record<SectionKey, number | null>;
};

const SECTIONS: SectionKey[] = ["worship", "confession", "connect", "sermon"];

export const getWorshipTrends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorshipTrends> => {
    const cutoff = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
    const { data, error } = await context.supabase
      .from("sunday_reviews")
      .select("service_date, worship_rating, confession_rating, connect_rating, sermon_rating")
      .gte("service_date", cutoff)
      .order("service_date", { ascending: true });
    if (error) throw new Error(error.message);

    // Group by date, average across submitters
    const byDate = new Map<string, Record<SectionKey, number[]>>();
    for (const r of (data ?? []) as any[]) {
      let bucket = byDate.get(r.service_date);
      if (!bucket) {
        bucket = { worship: [], confession: [], connect: [], sermon: [] };
        byDate.set(r.service_date, bucket);
      }
      for (const s of SECTIONS) {
        const v = r[`${s}_rating`];
        if (typeof v === "number") bucket[s].push(v);
      }
    }

    const dates = Array.from(byDate.keys()).sort();
    const rawAvgs: Record<SectionKey, Array<{ date: string; v: number | null }>> = {
      worship: [], confession: [], connect: [], sermon: [],
    };
    for (const d of dates) {
      const bucket = byDate.get(d)!;
      for (const s of SECTIONS) {
        const ns = bucket[s];
        rawAvgs[s].push({ date: d, v: ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null });
      }
    }

    const sections = {} as Record<SectionKey, TrendPoint[]>;
    const current = {} as Record<SectionKey, number | null>;
    const delta6w = {} as Record<SectionKey, number | null>;

    for (const s of SECTIONS) {
      const series = rawAvgs[s];
      const points: TrendPoint[] = series.map((pt, i) => {
        const window = series.slice(Math.max(0, i - 5), i + 1).map((p) => p.v).filter((v): v is number => typeof v === "number");
        const rolling = window.length ? window.reduce((a, b) => a + b, 0) / window.length : null;
        return { date: pt.date, raw_avg: pt.v, rolling_avg: rolling };
      });
      sections[s] = points;
      current[s] = points.length ? points[points.length - 1].rolling_avg : null;
      // delta vs 6 reviews ago
      const prev = points.length >= 7 ? points[points.length - 7].rolling_avg : null;
      delta6w[s] = current[s] != null && prev != null ? +(current[s]! - prev).toFixed(2) : null;
    }

    return { sections, current, delta6w };
  });
