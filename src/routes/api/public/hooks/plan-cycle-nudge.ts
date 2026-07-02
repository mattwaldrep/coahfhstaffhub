/**
 * Nudges leaders on plan submissions still incomplete.
 * Runs May 15 (draft/no submission) and Jun 20 (revision_requested / pending approval).
 * pg_cron POSTs with an `apikey` header.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fiscalYearOf } from "@/lib/fiscal-year";
import { checkCronAuth, sendCoreEmail } from "@/lib/cycle-hook-auth";

export const Route = createFileRoute("/api/public/hooks/plan-cycle-nudge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkCronAuth(request);
        if (unauth) return unauth;

        const now = new Date();
        const fy = fiscalYearOf(now.getFullYear(), 7);
        const month = now.getMonth() + 1;
        const phase = month <= 5 ? "pre_submission" : "post_review";

        const { data: cycle } = await supabaseAdmin
          .from("ministry_plan_cycles")
          .select("*")
          .eq("fiscal_year", fy)
          .maybeSingle();
        if (!cycle) return Response.json({ skipped: true, reason: "no cycle" });

        const targetStatuses =
          phase === "pre_submission"
            ? ["draft"]
            : ["revision_requested", "submitted", "under_review"];

        const { data: pending } = await supabaseAdmin
          .from("ministry_action_plans")
          .select("user_id, status")
          .eq("cycle_id", cycle.id)
          .in("status", targetStatuses as any);

        const leaderIds = Array.from(new Set((pending ?? []).map((p: any) => p.user_id)));
        if (leaderIds.length === 0) return Response.json({ nudged: 0, phase });

        const { data: profs } = await supabaseAdmin
          .from("profiles")
          .select("email")
          .in("id", leaderIds);
        const emails = (profs ?? []).map((p: any) => p.email).filter(Boolean);

        const subject =
          phase === "pre_submission"
            ? `Reminder: Ministry Plan draft due May 31 (FY ${fy})`
            : `Action needed: Ministry Plan revisions due Jun 25 (FY ${fy})`;
        const body =
          phase === "pre_submission"
            ? `<p>Your FY ${fy} Ministry Action Plan is still in draft. Please submit by <strong>May 31</strong> so core has time to review and give feedback before June 30.</p>`
            : `<p>Your FY ${fy} plan is awaiting your revisions (or final approval). Please close it out by <strong>Jun 25</strong> — cycle closes Jun 30.</p>`;

        const nudged = await sendCoreEmail({
          subject,
          bcc: emails,
          html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1f2937"><h1 style="font-size:18px">${subject}</h1>${body}<p style="color:#6b7280;font-size:12px">Open <strong>Annual Planning → Ministry Plan</strong> to continue.</p></body></html>`,
        });

        return Response.json({ phase, nudged });
      },
    },
  },
});
