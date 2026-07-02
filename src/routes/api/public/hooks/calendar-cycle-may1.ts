/**
 * May 1 — kicks off the annual Calendar Submission cycle.
 * Opens a calendar_planning_cycles row for FY (plan_year = fy).
 * Notifies leaders. Submissions themselves are created lazily by the existing UI.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fiscalYearOf } from "@/lib/fiscal-year";
import { checkCronAuth, sendCoreEmail } from "@/lib/cycle-hook-auth";

export const Route = createFileRoute("/api/public/hooks/calendar-cycle-may1")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkCronAuth(request);
        if (unauth) return unauth;

        const now = new Date();
        const fy = fiscalYearOf(now.getFullYear(), 7);
        const calYear = fy - 1;

        const { data: existing } = await supabaseAdmin
          .from("calendar_planning_cycles")
          .select("*")
          .eq("plan_year", fy)
          .maybeSingle();

        let cycle = existing;
        if (!cycle) {
          const { data: row, error } = await supabaseAdmin
            .from("calendar_planning_cycles")
            .insert({
              plan_year: fy,
              title: `FY ${fy} Annual Calendar`,
              opens_at: `${calYear}-05-01`,
              closes_at: `${calYear}-06-30`,
              status: "open",
            })
            .select("*")
            .single();
          if (error) return new Response(error.message, { status: 500 });
          cycle = row;
        }

        // Notify all active leaders
        const { data: assignments } = await supabaseAdmin
          .from("ministry_leader_assignments")
          .select("user_id")
          .eq("active", true);
        const leaderIds = Array.from(
          new Set((assignments ?? []).map((a: any) => a.user_id)),
        );
        const { data: profs } = await supabaseAdmin
          .from("profiles")
          .select("email")
          .in("id", leaderIds.length ? leaderIds : ["00000000-0000-0000-0000-000000000000"]);
        const emails = (profs ?? []).map((p: any) => p.email).filter(Boolean);

        const emailed = await sendCoreEmail({
          subject: `Annual Calendar kickoff — FY ${fy}`,
          bcc: emails,
          html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1f2937"><h1 style="font-size:20px">Annual Calendar — FY ${fy}</h1><p>The FY ${fy} calendar planning cycle is open. Please submit proposed events for your area(s) by <strong>May 31</strong>.</p><p>Open <strong>Annual Planning → Calendar Submission</strong> to begin. Feedback window is Jun 1–15, revisions due Jun 25, cycle closes Jun 30.</p></body></html>`,
        });

        return Response.json({ fy, cycle_id: cycle!.id, emailed_leaders: emailed });
      },
    },
  },
});
