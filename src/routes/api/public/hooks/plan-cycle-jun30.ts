/**
 * June 30 — closes out the plan cycle.
 * Marks cycle "complete" and emails core the final status roll-up.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fiscalYearOf } from "@/lib/fiscal-year";
import { checkCronAuth, sendCoreEmail } from "@/lib/cycle-hook-auth";

export const Route = createFileRoute("/api/public/hooks/plan-cycle-jun30")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkCronAuth(request);
        if (unauth) return unauth;

        const now = new Date();
        const fy = fiscalYearOf(now.getFullYear(), 7);

        const { data: cycle } = await supabaseAdmin
          .from("ministry_plan_cycles")
          .select("*")
          .eq("fiscal_year", fy)
          .maybeSingle();
        if (!cycle) return Response.json({ skipped: true });

        await supabaseAdmin
          .from("ministry_plan_cycles")
          .update({ status: "complete" })
          .eq("id", cycle.id);

        const { data: plans } = await supabaseAdmin
          .from("ministry_action_plans")
          .select("status, leader_name, ministry_area")
          .eq("cycle_id", cycle.id);
        const outstanding = (plans ?? []).filter((p: any) => p.status !== "approved");

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
          .map((p: any) => `<li>${p.leader_name} — ${p.ministry_area} (${p.status})</li>`)
          .join("");
        const emailed = await sendCoreEmail({
          subject: `Ministry Plan cycle closed — FY ${fy}`,
          bcc: emails,
          html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1f2937"><h1 style="font-size:18px">Ministry Plan cycle complete — FY ${fy}</h1><p>${(plans ?? []).length} plan(s) total. ${outstanding.length} still not approved:</p><ul>${rows || "<li>None — all approved.</li>"}</ul></body></html>`,
        });

        return Response.json({ closed: true, outstanding: outstanding.length, emailed });
      },
    },
  },
});
