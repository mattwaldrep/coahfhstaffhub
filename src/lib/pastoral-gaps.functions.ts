import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import { fetchCareList } from "@/server/pco.server";

export type PastoralGap = {
  pco_person_id: string;
  name: string;
  assigned_elder: string | null;
  days_since: number | null; // null = never contacted
  level: "green" | "amber" | "red";
};

async function assertElderAccess(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["elder", "elder_candidate"]);
  if (!data || data.length === 0) throw new Error("Forbidden: elder access required");
}

export const getPastoralGaps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertElderAccess(context.supabase, context.userId);

    const { data: cfg } = await context.supabase
      .from("elder_pco_config")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!cfg?.list_id || !cfg?.assigned_elder_field_id) {
      return { configured: false, gaps: [] as PastoralGap[], coverage_pct: 0, total: 0 };
    }

    const people = await fetchCareList({
      list_id: cfg.list_id,
      field_ids: [cfg.assigned_elder_field_id, cfg.spiritual_health_field_id].filter(Boolean) as string[],
    });
    const ids = people.map((p) => p.id);
    if (ids.length === 0) return { configured: true, gaps: [], coverage_pct: 100, total: 0 };

    // Last touchpoint per person
    const { data: tps } = await context.supabase
      .from("pco_touchpoints")
      .select("pco_person_id, created_at")
      .in("pco_person_id", ids)
      .order("created_at", { ascending: false });
    // Last note per person
    const { data: notes } = await context.supabase
      .from("pco_pastoral_notes")
      .select("pco_person_id, created_at")
      .in("pco_person_id", ids)
      .order("created_at", { ascending: false });

    const last: Record<string, number> = {};
    for (const r of (tps ?? []) as any[]) {
      const t = new Date(r.created_at).getTime();
      if (!last[r.pco_person_id] || t > last[r.pco_person_id]) last[r.pco_person_id] = t;
    }
    for (const r of (notes ?? []) as any[]) {
      const t = new Date(r.created_at).getTime();
      if (!last[r.pco_person_id] || t > last[r.pco_person_id]) last[r.pco_person_id] = t;
    }

    const now = Date.now();
    const gaps: PastoralGap[] = people.map((p) => {
      const lastTs = last[p.id];
      const days = lastTs ? Math.floor((now - lastTs) / 86400000) : null;
      let level: "green" | "amber" | "red" = "green";
      if (days === null || days >= 60) level = "red";
      else if (days >= 45) level = "amber";
      const elderVal = (p.fields[cfg.assigned_elder_field_id]?.value ?? null)?.toString().trim() || null;
      return {
        pco_person_id: p.id,
        name: p.name,
        assigned_elder: elderVal,
        days_since: days,
        level,
      };
    });

    const covered = gaps.filter((g) => g.level === "green").length;
    const coverage_pct = Math.round((covered / gaps.length) * 100);
    return { configured: true, gaps, coverage_pct, total: gaps.length };
  });
