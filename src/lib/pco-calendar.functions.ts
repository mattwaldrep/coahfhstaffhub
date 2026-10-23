import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";

export type { PcoCalendarInstance, PcoTagGroup } from "@/server/pco-calendar.server";

/** Read-only pull of Planning Center Calendar events (any staff role). */
export const getPcoCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ from: z.string().datetime(), to: z.string().datetime() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .in("role", ["core", "meeting", "extended", "calendar_admin", "serve_leader_admin"]);
    if (!roles || roles.length === 0) throw new Error("Forbidden: staff role required");

    // Cap the window at ~13 months to keep requests bounded.
    const from = new Date(data.from);
    const maxTo = new Date(from.getTime() + 400 * 86400000);
    const to = new Date(data.to) > maxTo ? maxTo : new Date(data.to);

    const { fetchEventInstances, fetchTagGroups } = await import("@/server/pco-calendar.server");
    try {
      const [instances, tagGroups] = await Promise.all([
        fetchEventInstances(from.toISOString(), to.toISOString()),
        fetchTagGroups(),
      ]);
      return { instances, tagGroups, error: null as string | null };
    } catch (e) {
      console.error("PCO calendar fetch failed", e);
      return { instances: [], tagGroups: [], error: "Couldn't reach Planning Center Calendar. Try again shortly." };
    }
  });
