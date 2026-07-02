/**
 * Calendar nudges. Runs May 15 (draft) and Jun 20 (revision_requested / pending).
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fiscalYearOf } from "@/lib/fiscal-year";
import { checkCronAuth, sendCoreEmail } from "@/lib/cycle-hook-auth";

export const Route = createFileRoute("/api/public/hooks/calendar-cycle-nudge")({
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
          .from("calendar_planning_cycles")
          .select("*")
          .eq("plan_year", fy)
          .maybeSingle();
        if (!cycle) return Response.json({ skipped: true });

        const target =
          phase === "pre_submission"
            ? ["draft"]
            : ["revision_requested", "submitted", "in_review"];

        const { data: subs } = await supabaseAdmin
          .from("calendar_plan_submissions")
          .select("leader_id")
          .eq("cycle_id", cycle.id)
          .in("status", target);
        const ids = Array.from(new Set((subs ?? []).map((s: any) => s.leader_id)));
        if (ids.length === 0) return Response.json({ phase, nudged: 0 });

        const { data: profs } = await supabaseAdmin
          .from("profiles")
          .select("email")
          .in("id", ids);
        const emails = (profs ?? []).map((p: any) => p.email).filter(Boolean);

        const subject =
          phase === "pre_submission"
            ? `Reminder: Annual Calendar draft due May 31 (FY ${fy})`
            : `Action needed: Calendar revisions due Jun 25 (FY ${fy})`;
        const body =
          phase === "pre_submission"
            ? `<p>Your FY ${fy} calendar submission is still in draft. Please submit by <strong>May 31</strong> to leave time for review and feedback.</p>`
            : `<p>Your FY ${fy} calendar submission is awaiting your revisions or final approval. Please close it out by <strong>Jun 25</strong> — cycle closes Jun 30.</p>`;

        const nudged = await sendCoreEmail({
          subject,
          bcc: emails,
          html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1f2937"><h1 style="font-size:18px">${subject}</h1>${body}<p style="color:#6b7280;font-size:12px">Open <strong>Annual Planning → Calendar Submission</strong>.</p></body></html>`,
        });

        return Response.json({ phase, nudged });
      },
    },
  },
});
