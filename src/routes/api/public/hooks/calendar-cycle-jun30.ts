/**
 * June 30 — closes the calendar cycle. Emails core the final rollup.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fiscalYearOf } from "@/lib/fiscal-year";
import { checkCronAuth, sendCoreEmail } from "@/lib/cycle-hook-auth";

export const Route = createFileRoute("/api/public/hooks/calendar-cycle-jun30")({
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

        await supabaseAdmin
          .from("calendar_planning_cycles")
          .update({ status: "closed" })
          .eq("id", cycle.id);

        const { data: subs } = await supabaseAdmin
          .from("calendar_plan_submissions")
          .select("status, sub_calendar, leader_id")
          .eq("cycle_id", cycle.id);
        const outstanding = (subs ?? []).filter(
          (s: any) => !["approved", "partially_approved"].includes(s.status),
        );

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
        const rows = outstanding
          .map((s: any) => `<li>${s.sub_calendar} — ${s.status}</li>`)
          .join("");

        const emailed = await sendCoreEmail({
          subject: `Annual Calendar cycle closed — FY ${fy}`,
          bcc: emails,
          html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1f2937"><h1 style="font-size:18px">Annual Calendar cycle complete — FY ${fy}</h1><p>${(subs ?? []).length} submission(s). ${outstanding.length} still open:</p><ul>${rows || "<li>None — all resolved.</li>"}</ul></body></html>`,
        });

        return Response.json({ closed: true, outstanding: outstanding.length, emailed });
      },
    },
  },
});
