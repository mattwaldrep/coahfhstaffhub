/**
 * May 1 — kicks off the annual Ministry Action Plan cycle.
 * - Opens (or gets) the ministry_plan_cycles row for the upcoming FY.
 * - Seeds a draft MAP for each active ministry leader assignment
 *   (unique on user_id/ministry_area/calendar_year).
 * - Emails leaders + notifies core.
 * Idempotent.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fiscalYearOf } from "@/lib/fiscal-year";
import { checkCronAuth, sendCoreEmail } from "@/lib/cycle-hook-auth";

export const Route = createFileRoute("/api/public/hooks/plan-cycle-may1")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkCronAuth(request);
        if (unauth) return unauth;

        const now = new Date();
        const fy = fiscalYearOf(now.getFullYear(), 7);
        const calYear = fy - 1;

        // Open cycle
        const { data: existing } = await supabaseAdmin
          .from("ministry_plan_cycles")
          .select("*")
          .eq("fiscal_year", fy)
          .maybeSingle();

        let cycle = existing;
        if (!cycle) {
          const { data: row, error } = await supabaseAdmin
            .from("ministry_plan_cycles")
            .insert({
              fiscal_year: fy,
              status: "open",
              opens_at: `${calYear}-05-01`,
              submissions_due_at: `${calYear}-05-31`,
              feedback_due_at: `${calYear}-06-15`,
              closes_at: `${calYear}-06-30`,
            })
            .select("*")
            .single();
          if (error) return new Response(error.message, { status: 500 });
          cycle = row;
        }

        // Seed a draft plan per active leader (upsert by unique constraint)
        const { data: assignments } = await supabaseAdmin
          .from("ministry_leader_assignments")
          .select("user_id, ministry_area")
          .eq("active", true);
        const active = assignments ?? [];

        const { data: existingPlans } = await supabaseAdmin
          .from("ministry_action_plans")
          .select("user_id, ministry_area")
          .eq("calendar_year", calYear);
        const have = new Set(
          (existingPlans ?? []).map((p: any) => `${p.user_id}|${p.ministry_area}`),
        );

        // Pull leader name from profiles
        const leaderIds = Array.from(new Set(active.map((a: any) => a.user_id)));
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, email")
          .in("id", leaderIds.length ? leaderIds : ["00000000-0000-0000-0000-000000000000"]);
        const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

        const toInsert = active
          .filter((a: any) => !have.has(`${a.user_id}|${a.ministry_area}`))
          .map((a: any) => ({
            user_id: a.user_id,
            ministry_area: a.ministry_area,
            leader_name: profMap.get(a.user_id)?.full_name ?? "",
            calendar_year: calYear,
            fiscal_year: fy,
            cycle_id: cycle!.id,
            status: "draft",
          }));

        if (toInsert.length > 0) {
          await supabaseAdmin.from("ministry_action_plans").insert(toInsert as any);
        }

        // Backfill cycle_id on any existing rows for the year
        await supabaseAdmin
          .from("ministry_action_plans")
          .update({ cycle_id: cycle!.id, fiscal_year: fy })
          .eq("calendar_year", calYear)
          .is("cycle_id", null);

        // Notify leaders
        const leaderEmails = (profiles ?? [])
          .map((p: any) => p.email)
          .filter(Boolean);
        const emailed = await sendCoreEmail({
          subject: `Annual Ministry Plan kickoff — FY ${fy}`,
          bcc: leaderEmails,
          html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1f2937">
  <h1 style="font-size:20px">Annual Ministry Plan — FY ${fy}</h1>
  <p>Your Ministry Action Plan for FY ${fy} is open. Please complete your draft by <strong>May 31</strong>.</p>
  <p>Head to <strong>Annual Planning → Ministry Plan</strong> in the app. Your 10,000-ft view from the budget cycle has been pre-filled where it applies — flesh it out through the full MAP flow.</p>
  <p style="color:#6b7280;font-size:12px">Feedback window Jun 1–15. Revisions due Jun 25. Cycle closes Jun 30.</p>
</body></html>`,
        });

        return Response.json({
          fy,
          cycle_id: cycle!.id,
          seeded_plans: toInsert.length,
          emailed_leaders: emailed,
        });
      },
    },
  },
});
