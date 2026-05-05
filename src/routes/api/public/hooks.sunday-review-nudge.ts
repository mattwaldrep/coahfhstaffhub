import { createFileRoute } from "@tanstack/react-router";
import { format, subDays } from "date-fns";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail, emailLayout, escapeHtml } from "@/server/email.server";

export const Route = createFileRoute("/api/public/hooks/sunday-review-nudge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        const expected = `Bearer ${process.env.CRON_SHARED_SECRET}`;
        if (!process.env.CRON_SHARED_SECRET || auth !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        // Find the most recent Sunday (today if Sunday, else last Sunday)
        const now = new Date();
        const dow = now.getDay();
        const lastSunday = subDays(now, dow === 0 ? 0 : dow);
        const sundayStr = format(lastSunday, "yyyy-MM-dd");

        const { data: existing } = await supabaseAdmin
          .from("sunday_reviews")
          .select("submitted_by")
          .eq("service_date", sundayStr);
        const submittedSet = new Set((existing ?? []).map((r: any) => r.submitted_by).filter(Boolean));

        const [{ data: profiles }, { data: roles }] = await Promise.all([
          supabaseAdmin.from("profiles").select("id, full_name, email"),
          supabaseAdmin.from("user_roles").select("user_id, role").in("role", ["core", "meeting"]),
        ]);
        const eligibleIds = new Set((roles ?? []).map((r: any) => r.user_id));
        const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

        let sent = 0;
        for (const userId of eligibleIds) {
          if (submittedSet.has(userId)) continue;
          const p = profileById.get(userId) as any;
          if (!p?.email) continue;
          const html = emailLayout(
            "Sunday Review reminder",
            `<p>Hi ${escapeHtml(p.full_name || p.email.split("@")[0])} — just a nudge to log your reflection on yesterday's service before tomorrow's staff meeting.</p>
             <p style="margin-top:20px;">
               <a href="https://staffhub.coahforesthills.org/sunday-review" style="display:inline-block;background:#0c0a09;color:#fafaf9;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Submit your review</a>
             </p>
             <p style="color:#78716c;font-size:12px;margin-top:24px;">Service date: ${escapeHtml(format(lastSunday, "EEEE, MMM d"))}</p>`,
          );
          try {
            await sendEmail({ to: p.email, subject: "Don't forget your Sunday Review", html });
            sent++;
          } catch (e) {
            console.error("nudge failed for", p.email, e);
          }
        }
        return Response.json({ ok: true, sent, sundayStr, eligible: eligibleIds.size });
      },
    },
  },
});
