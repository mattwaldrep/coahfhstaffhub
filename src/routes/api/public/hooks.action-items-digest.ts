import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail, emailLayout, escapeHtml } from "@/server/email.server";

export const Route = createFileRoute("/api/public/hooks/action-items-digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        const expected = `Bearer ${process.env.CRON_SHARED_SECRET}`;
        if (!process.env.CRON_SHARED_SECRET || auth !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const today = new Date();
        const todayStr = format(today, "yyyy-MM-dd");

        const [{ data: actions }, { data: profiles }, { data: roles }] = await Promise.all([
          supabaseAdmin.from("action_items").select("*").eq("completed", false),
          supabaseAdmin.from("profiles").select("id, full_name, email"),
          supabaseAdmin.from("user_roles").select("user_id, role").in("role", ["core", "meeting"]),
        ]);

        const eligibleIds = new Set((roles ?? []).map((r: any) => r.user_id));
        const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

        let sent = 0;
        for (const userId of eligibleIds) {
          const profile = profileById.get(userId) as any;
          if (!profile?.email) continue;

          const mine = (actions ?? []).filter((a: any) => a.assignee_id === userId);
          const overdue = mine.filter((a: any) => a.due_date && a.due_date < todayStr);
          const dueSoon = mine.filter((a: any) => a.due_date && a.due_date >= todayStr && a.due_date <= format(new Date(today.getTime() + 7 * 86400000), "yyyy-MM-dd"));
          const noDate = mine.filter((a: any) => !a.due_date);

          if (mine.length === 0) continue;

          const list = (items: any[], emptyText: string) =>
            items.length === 0
              ? `<div style="color:#a8a29e;font-style:italic;">${emptyText}</div>`
              : `<ul style="padding-left:18px;margin:4px 0;">${items
                  .map((a) => `<li>${escapeHtml(a.title)}${a.due_date ? ` <span style="color:#78716c;">— ${escapeHtml(format(new Date(a.due_date + "T12:00"), "MMM d"))}</span>` : ""}</li>`)
                  .join("")}</ul>`;

          const html = emailLayout(
            "Your action items this week",
            `<p style="margin:0 0 16px;color:#57534e;">Hey ${escapeHtml(profile.full_name || profile.email.split("@")[0])} — here's what's on your plate.</p>
             ${overdue.length ? `<h3 style="color:#b91c1c;margin:20px 0 4px;">Overdue (${overdue.length})</h3>${list(overdue, "")}` : ""}
             <h3 style="margin:20px 0 4px;">Due in the next 7 days (${dueSoon.length})</h3>
             ${list(dueSoon, "Nothing due soon.")}
             ${noDate.length ? `<h3 style="margin:20px 0 4px;">No due date (${noDate.length})</h3>${list(noDate, "")}` : ""}`,
          );

          try {
            await sendEmail({ to: profile.email, subject: `Your action items — ${format(today, "MMM d")}`, html });
            sent++;
          } catch (e) {
            console.error("digest send failed for", profile.email, e);
          }
        }

        return Response.json({ ok: true, sent });
      },
    },
  },
});
