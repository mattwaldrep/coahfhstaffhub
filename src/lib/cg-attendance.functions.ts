import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import { supabaseAdmin } from "@/lib/admin.server";
import { cgAttendanceWindow, chicagoDate } from "@/lib/cg-attendance-window";
import { listGroupsByType, listMissingAttendanceEvents } from "@/server/pco-groups.server";

export type CgMissingGroup = {
  group_id: string;
  group_name: string;
  events: { id: string; name: string; starts_at: string | null }[];
};

export type CgAttendanceGaps = {
  configured: boolean;
  start: string;
  end: string;
  total_groups: number;
  missing: CgMissingGroup[];
  error?: string;
};

const cache = new Map<string, { at: number; data: CgAttendanceGaps }>();
const CACHE_MS = 5 * 60_000;

export const getCgAttendanceGaps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ refDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), refresh: z.boolean().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<CgAttendanceGaps> => {
    const { data: isStaff } = await context.supabase.rpc("is_staff_member", { _user_id: context.userId });
    if (!isStaff) throw new Error("Forbidden");

    const { start, end } = cgAttendanceWindow(data.refDate ?? chicagoDate(new Date()));
    const { data: cfg } = await supabaseAdmin
      .from("cg_pco_config")
      .select("group_type_id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!cfg?.group_type_id) return { configured: false, start, end, total_groups: 0, missing: [] };

    const key = `${cfg.group_type_id}:${start}`;
    const hit = cache.get(key);
    if (!data.refresh && hit && Date.now() - hit.at < CACHE_MS) return hit.data;

    try {
      const groups = await listGroupsByType(cfg.group_type_id);
      const missing: CgMissingGroup[] = [];
      for (let i = 0; i < groups.length; i += 8) {
        const batch = groups.slice(i, i + 8);
        const results = await Promise.all(
          batch.map(async (g) => ({ g, events: await listMissingAttendanceEvents(g.id, start, end) })),
        );
        for (const { g, events } of results) {
          if (events.length) missing.push({ group_id: g.id, group_name: g.name, events });
        }
      }
      missing.sort((a, b) => a.group_name.localeCompare(b.group_name));
      const out = { configured: true, start, end, total_groups: groups.length, missing };
      cache.set(key, { at: Date.now(), data: out });
      return out;
    } catch (e: any) {
      console.error("[cg-attendance]", e?.message ?? e);
      return { configured: true, start, end, total_groups: 0, missing: [], error: "Couldn't reach Planning Center Groups." };
    }
  });
