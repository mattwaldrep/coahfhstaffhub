/**
 * Advances the active budget cycle to sheet_submission on April 1.
 * Also creates a dashboard task for core users to post each ministry's Google Sheet link.
 *
 * Triggered by pg_cron on 04-01 09:00 America/Chicago (POST with `apikey`).
 * Idempotent.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fiscalYearOf } from "@/lib/fiscal-year";

export const Route = createFileRoute("/api/public/hooks/budget-cycle-apr1")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const allowed = [
          process.env.SUPABASE_ANON_KEY,
          process.env.SUPABASE_PUBLISHABLE_KEY,
        ].filter(Boolean) as string[];
        if (!apikey || !allowed.includes(apikey)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const now = new Date();
        const fy = fiscalYearOf(now.getFullYear(), 7);

        const { data: cycle } = await supabaseAdmin
          .from("budget_cycles")
          .select("*")
          .eq("fiscal_year", fy)
          .maybeSingle();
        if (!cycle) return Response.json({ skipped: true, reason: "no cycle" });

        if (cycle.status === "rough_planning") {
          await supabaseAdmin
            .from("budget_cycles")
            .update({ status: "sheet_submission" })
            .eq("id", cycle.id);
        }

        const { data: coreRoles } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "core");
        const coreIds = Array.from(new Set((coreRoles ?? []).map((r: any) => r.user_id)));

        // Dashboard task per core user reminding them to post sheet links
        if (coreIds.length > 0) {
          const taskTitle = `Post Google Sheet budget links (FY ${fy})`;
          const existingTasks = await supabaseAdmin
            .from("action_items")
            .select("id, assignee_id")
            .eq("title", taskTitle);
          const alreadyHas = new Set(
            (existingTasks.data ?? []).map((r: any) => r.assignee_id),
          );
          const rows = coreIds
            .filter((id) => !alreadyHas.has(id))
            .map((id) => ({
              title: taskTitle,
              notes:
                "April 1: paste each ministry leader's Google Sheet budget URL on their submission.",
              assignee_id: id,
              due_date: `${fy - 1}-04-05`,
              created_by: id,
            }));
          if (rows.length > 0) {
            await supabaseAdmin.from("action_items").insert(rows as any);
          }
        }

        // Email leaders who haven't submitted rough yet — nudge them
        let nudged = 0;
        const { data: pending } = await supabaseAdmin
          .from("ministry_budget_submissions")
          .select("user_id, ministry_area, rough_status")
          .eq("cycle_id", cycle.id)
          .neq("rough_status", "submitted");
        const leaderIds = Array.from(new Set((pending ?? []).map((p: any) => p.user_id)));
        if (leaderIds.length > 0 && process.env.RESEND_API_KEY && process.env.EMAIL_FROM_ADDRESS) {
          const { data: profs } = await supabaseAdmin
            .from("profiles")
            .select("id, email, full_name")
            .in("id", leaderIds);
          const byId = new Map((profs ?? []).map((p: any) => [p.id, p]));
          for (const p of pending ?? []) {
            const prof: any = byId.get(p.user_id);
            if (!prof?.email) continue;
            const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1f2937">
  <h1 style="font-size:18px">Rough budget still pending — ${p.ministry_area}</h1>
  <p>Hi ${prof.full_name || "there"},</p>
  <p>Your rough budget request and 10,000-ft plan for <strong>${p.ministry_area}</strong> were due March 31.</p>
  <p>Please wrap those up in Annual Planning → Budget. Your Google Sheet link is now posted (or coming shortly).</p>
</body></html>`;
            const resp = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: process.env.EMAIL_FROM_ADDRESS,
                to: prof.email,
                subject: `Reminder: rough budget for ${p.ministry_area}`,
                html,
              }),
            });
            if (resp.ok) nudged++;
          }
        }

        return Response.json({ fy, cycle_id: cycle.id, nudged });
      },
    },
  },
});
