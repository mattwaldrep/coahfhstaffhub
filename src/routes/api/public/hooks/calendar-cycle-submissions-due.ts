/**
 * May 31 — calendar submission deadline. Cycle → review; core notified.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fiscalYearOf } from "@/lib/fiscal-year";
import { checkCronAuth, sendCoreEmail } from "@/lib/cycle-hook-auth";

export const Route = createFileRoute("/api/public/hooks/calendar-cycle-submissions-due")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkCronAuth(request);
        if (unauth) return unauth;

        const now = new Date();
        const fy = fiscalYearOf(now.getFullYear(), 7);

        const { data: cycle } = await supabaseAdmin
          .from("calendar_planning_cycles")
          .select("*")
          .eq("plan_year", fy)
          .maybeSingle();
        if (!cycle) return Response.json({ skipped: true });

        if (cycle.status === "open") {
          await supabaseAdmin
            .from("calendar_planning_cycles")
            .update({ status: "review" })
            .eq("id", cycle.id);
        }

        const { data: subs } = await supabaseAdmin
          .from("calendar_plan_submissions")
          .select("status")
          .eq("cycle_id", cycle.id);
        const counts: Record<string, number> = {};
        for (const s of subs ?? []) counts[s.status] = (counts[s.status] ?? 0) + 1;

        const { data: coreRoles } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "core");
        const coreIds = Array.from(new Set((coreRoles ?? []).map((r: any) => r.user_id)));
        const { data: profs } = await supabaseAdmin
          .from("profiles")
          .select("email")
          .in("id", coreIds.length ? coreIds : ["00000000-0000-0000-0000-000000000000"]);
        const emails = (profs ?? []).map((p: any) => p.email).filter(Boolean);
        const rows = Object.entries(counts)
          .map(([k, v]) => `<tr><td>${k}</td><td style="text-align:right">${v}</td></tr>`)
          .join("");

        const emailed = await sendCoreEmail({
          subject: `Annual Calendar submissions closed — review window open (FY ${fy})`,
          bcc: emails,
          html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1f2937"><h1 style="font-size:18px">Annual Calendar submissions — FY ${fy}</h1><p>May 31 has passed. Review window is open through <strong>Jun 15</strong>.</p><table style="border-collapse:collapse;min-width:220px"><tbody>${rows}</tbody></table></body></html>`,
        });

        if (coreIds.length > 0) {
          const taskTitle = `Review Annual Calendar submissions (FY ${fy})`;
          const existing = await supabaseAdmin
            .from("action_items")
            .select("assignee_id")
            .eq("title", taskTitle);
          const has = new Set((existing.data ?? []).map((r: any) => r.assignee_id));
          const newTasks = coreIds
            .filter((id) => !has.has(id))
            .map((id) => ({
              title: taskTitle,
              notes: "Review each submission by Jun 15. Approve, partially approve, or request revisions.",
              assignee_id: id,
              due_date: `${fy - 1}-06-15`,
              created_by: id,
            }));
          if (newTasks.length > 0) {
            await supabaseAdmin.from("action_items").insert(newTasks as any);
          }
        }

        return Response.json({ counts, emailed });
      },
    },
  },
});
