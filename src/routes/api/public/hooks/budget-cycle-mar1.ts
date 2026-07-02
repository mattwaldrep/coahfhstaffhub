/**
 * Kicks off the annual budget cycle on March 1:
 * - Opens (or gets) the budget_cycles row for the upcoming fiscal year.
 * - Ensures a ministry_budget_submissions row exists for every active leader.
 * - Emails core users prompting them to upload each ministry's 12-month spending report.
 * - Creates a dashboard action_item per core user reminding them to upload.
 *
 * Triggered by pg_cron on 03-01 09:00 America/Chicago (POST with `apikey`).
 * Idempotent: safe to run more than once.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fiscalYearOf } from "@/lib/fiscal-year";

export const Route = createFileRoute("/api/public/hooks/budget-cycle-mar1")({
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
        // On Mar 1 (calendar year Y), we're planning FY that starts Jul Y (= FY Y+1).
        const fy = fiscalYearOf(now.getFullYear(), 7);

        // Open or get cycle
        const { data: existingCycle } = await supabaseAdmin
          .from("budget_cycles")
          .select("*")
          .eq("fiscal_year", fy)
          .maybeSingle();

        let cycle = existingCycle;
        if (!cycle) {
          const { data: row, error } = await supabaseAdmin
            .from("budget_cycles")
            .insert({
              fiscal_year: fy,
              status: "rough_planning",
              rough_due_date: `${fy - 1}-03-31`,
              sheet_link_target_date: `${fy - 1}-04-01`,
              opened_at: now.toISOString(),
            })
            .select("*")
            .single();
          if (error) return new Response(error.message, { status: 500 });
          cycle = row;
        }

        // Ensure submission rows exist per active leader assignment
        const { data: assignments } = await supabaseAdmin
          .from("ministry_leader_assignments")
          .select("user_id, ministry_area")
          .eq("active", true);
        const active = assignments ?? [];

        const { data: existingSubs } = await supabaseAdmin
          .from("ministry_budget_submissions")
          .select("user_id, ministry_area")
          .eq("cycle_id", cycle.id);
        const have = new Set(
          (existingSubs ?? []).map((s: any) => `${s.user_id}|${s.ministry_area}`),
        );
        const toInsert = active
          .filter((a: any) => !have.has(`${a.user_id}|${a.ministry_area}`))
          .map((a: any) => ({
            cycle_id: cycle!.id,
            user_id: a.user_id,
            ministry_area: a.ministry_area,
          }));
        if (toInsert.length > 0) {
          await supabaseAdmin.from("ministry_budget_submissions").insert(toInsert);
        }

        // Notify core users + create dashboard task
        const { data: coreRoles } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "core");
        const coreIds = Array.from(new Set((coreRoles ?? []).map((r: any) => r.user_id)));

        let emailed = 0;
        if (coreIds.length > 0) {
          const { data: profs } = await supabaseAdmin
            .from("profiles")
            .select("id, email, full_name")
            .in("id", coreIds);
          const emails = (profs ?? []).map((p: any) => p.email).filter(Boolean);

          // Dashboard tasks (one per core user); dedupe by title.
          const taskTitle = `Upload 12-month spending reports (FY ${fy})`;
          const dueDate = `${fy - 1}-03-07`;
          const existingTasks = await supabaseAdmin
            .from("action_items")
            .select("id, assignee_id")
            .eq("title", taskTitle);
          const alreadyHas = new Set(
            (existingTasks.data ?? []).map((r: any) => r.assignee_id),
          );
          const taskRows = coreIds
            .filter((id) => !alreadyHas.has(id))
            .map((id) => ({
              title: taskTitle,
              notes:
                "March 1 kickoff: post each ministry's Feb–Feb spending report in Annual Planning → Budget.",
              assignee_id: id,
              due_date: dueDate,
              created_by: id,
            }));
          if (taskRows.length > 0) {
            await supabaseAdmin.from("action_items").insert(taskRows as any);
          }

          if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM_ADDRESS && emails.length > 0) {
            const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1f2937">
  <h1 style="font-size:20px">Annual budget kickoff — FY ${fy}</h1>
  <p>It's March 1. Time to run and upload the 12-month spending report (Feb – Feb) for each ministry area.</p>
  <p>Head to <strong>Annual Planning → Budget</strong> in the app. Uploading each report notifies that ministry leader and starts their rough-budget + 10,000-ft plan (due March 31).</p>
  <p style="color:#6b7280;font-size:12px">${active.length} active ministry leader assignment(s).</p>
</body></html>`;
            const resp = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: process.env.EMAIL_FROM_ADDRESS,
                to: [process.env.EMAIL_FROM_ADDRESS],
                bcc: emails,
                subject: `Budget kickoff — upload spending reports (FY ${fy})`,
                html,
              }),
            });
            if (resp.ok) emailed = emails.length;
          }
        }

        return Response.json({
          fy,
          cycle_id: cycle!.id,
          created_submissions: toInsert.length,
          emailed_core: emailed,
        });
      },
    },
  },
});
