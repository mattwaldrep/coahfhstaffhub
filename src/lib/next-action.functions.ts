import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";

export type NextAction = {
  kind: "overdue_action" | "today_action" | "forgotten_person" | "sunday_review" | "stale_motion";
  title: string;
  reason: string;
  href: string;
} | null;

export const getNextBestAction = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NextAction> => {
    const { supabase, userId } = context;
    const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const roles = (roleRows ?? []).map((r: any) => r.role as string);
    const isElder = roles.includes("elder") || roles.includes("elder_candidate");
    const isFullElder = roles.includes("elder");
    const isStaff = roles.some((r) => ["core", "meeting", "extended"].includes(r));

    const today = new Date().toISOString().slice(0, 10);

    // 1. Overdue action
    const { data: overdue } = await supabase
      .from("action_items")
      .select("id, title, due_date")
      .eq("assignee_id", userId)
      .eq("completed", false)
      .lt("due_date", today)
      .order("due_date", { ascending: true })
      .limit(1);
    if (overdue && overdue.length) {
      const a = overdue[0] as any;
      const days = Math.max(1, Math.floor((Date.now() - new Date(a.due_date).getTime()) / 86400000));
      return { kind: "overdue_action", title: a.title, reason: `Overdue by ${days} day${days === 1 ? "" : "s"}`, href: "/meeting" };
    }

    // 2. Due today
    const { data: dueToday } = await supabase
      .from("action_items")
      .select("id, title")
      .eq("assignee_id", userId)
      .eq("completed", false)
      .eq("due_date", today)
      .limit(1);
    if (dueToday && dueToday.length) {
      const a = dueToday[0] as any;
      return { kind: "today_action", title: a.title, reason: "Due today", href: "/meeting" };
    }

    // 3. Reddest forgotten person (elders)
    if (isElder) {
      try {
        const { getPastoralGaps } = await import("./pastoral-gaps.functions");
        const res: any = await (getPastoralGaps as any)({});
        const reds = (res?.gaps ?? []).filter((g: any) => g.level === "red");
        if (reds.length) {
          // sort by days_since desc, nulls (never) first
          reds.sort((a: any, b: any) => {
            if (a.days_since === null) return -1;
            if (b.days_since === null) return 1;
            return b.days_since - a.days_since;
          });
          const r = reds[0];
          const reason = r.days_since === null ? "No pastoral contact yet" : `No contact in ${r.days_since} days`;
          return { kind: "forgotten_person", title: r.name, reason, href: "/elder/pastoral-care" };
        }
      } catch {/* ignore */}
    }

    // 4. Sunday review (core/meeting)
    if (isStaff && roles.some((r) => ["core", "meeting"].includes(r))) {
      const d = new Date();
      d.setDate(d.getDate() - d.getDay());
      const lastSunday = d.toISOString().slice(0, 10);
      const { data: mine } = await supabase
        .from("sunday_reviews")
        .select("id")
        .eq("service_date", lastSunday)
        .eq("submitted_by", userId)
        .limit(1);
      if (!mine || mine.length === 0) {
        return {
          kind: "sunday_review",
          title: "Submit Sunday review",
          reason: `No review yet for ${lastSunday}`,
          href: "/sunday-review",
        };
      }
    }

    // 5. Stale elder motion
    if (isFullElder) {
      const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data: motions } = await supabase
        .from("elder_motions")
        .select("id, title, created_at")
        .is("closed_at", null)
        .lt("created_at", cutoff)
        .order("created_at", { ascending: true })
        .limit(1);
      if (motions && motions.length) {
        const m = motions[0] as any;
        const days = Math.floor((Date.now() - new Date(m.created_at).getTime()) / 86400000);
        return { kind: "stale_motion", title: m.title, reason: `Open motion · ${days} days old`, href: `/elder/motions/${m.id}` };
      }
    }

    return null;
  });
