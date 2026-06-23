/**
 * Monday "This week" digest — per-recipient personalized summary.
 * Sent to core, meeting, elder, elder_candidate roles.
 *
 * pg_cron: Mondays at 12:00 UTC (7am EST).
 * Auth: Bearer ${CRON_SHARED_SECRET}.
 */
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail, emailLayout, escapeHtml } from "@/server/email.server";

type Profile = { id: string; full_name: string | null; email: string | null };

export const Route = createFileRoute("/api/public/hooks/weekly-digest-monday")({
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
        const in7 = new Date(today.getTime() + 7 * 86400000);
        const in14Str = format(new Date(today.getTime() + 14 * 86400000), "yyyy-MM-dd");

        const [{ data: roleRows }, { data: events }, { data: actions }, { data: trips }] =
          await Promise.all([
            supabaseAdmin
              .from("user_roles")
              .select("user_id, role")
              .in("role", ["core", "meeting", "elder", "elder_candidate"]),
            supabaseAdmin
              .from("calendar_events")
              .select("title, start_at, sub_calendar")
              .gte("start_at", today.toISOString())
              .lt("start_at", in7.toISOString())
              .order("start_at", { ascending: true }),
            supabaseAdmin.from("action_items").select("title, due_date, assignee_id, completed"),
            supabaseAdmin
              .from("mission_trips")
              .select("church_name, status, start_date")
              .in("status", ["in_field", "pre_trip"]),
          ]);

        const recipients = new Map<string, Set<string>>();
        for (const r of roleRows ?? []) {
          if (!recipients.has(r.user_id)) recipients.set(r.user_id, new Set());
          recipients.get(r.user_id)!.add(r.role);
        }
        const userIds = Array.from(recipients.keys());
        if (userIds.length === 0) return Response.json({ sent: 0 });

        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds);
        const profileById = new Map(
          (profiles ?? []).map((p: any) => [p.id as string, p as Profile]),
        );

        const inField = (trips ?? []).filter((t: any) => t.status === "in_field");
        const arriving = (trips ?? []).filter(
          (t: any) =>
            t.status === "pre_trip" && t.start_date && t.start_date > todayStr && t.start_date <= in14Str,
        );

        // Elder-only: pastoral attention counts
        const sixtyAgo = new Date(Date.now() - 60 * 86400000).toISOString();
        const fortyFiveAgo = new Date(Date.now() - 45 * 86400000).toISOString();
        const { count: redCount } = await supabaseAdmin
          .from("pco_touchpoints")
          .select("pco_person_id", { count: "exact", head: true })
          .lt("created_at", sixtyAgo);
        const { count: amberCount } = await supabaseAdmin
          .from("pco_touchpoints")
          .select("pco_person_id", { count: "exact", head: true })
          .lt("created_at", fortyFiveAgo)
          .gte("created_at", sixtyAgo);

        const eventsHtml = !events?.length
          ? `<p style="color:#a8a29e;font-style:italic;">No scheduled events.</p>`
          : `<ul style="padding-left:18px;margin:4px 0;">${events
              .slice(0, 10)
              .map(
                (e: any) =>
                  `<li><strong>${escapeHtml(e.title)}</strong> — ${escapeHtml(format(new Date(e.start_at), "EEE MMM d, p"))}${e.sub_calendar ? ` <span style="color:#78716c;">· ${escapeHtml(e.sub_calendar)}</span>` : ""}</li>`,
              )
              .join("")}</ul>`;

        const missionsHtml =
          inField.length === 0 && arriving.length === 0
            ? ""
            : `<h3 style="margin:20px 0 4px;">Missions</h3>
               ${inField.length ? `<div style="color:#57534e;">In field: ${inField.map((t: any) => escapeHtml(t.church_name)).join(", ")}</div>` : ""}
               ${arriving.length ? `<div style="color:#57534e;">Arriving in next 2 weeks: ${arriving.map((t: any) => `${escapeHtml(t.church_name)} (${t.start_date})`).join(", ")}</div>` : ""}`;

        let sent = 0;
        for (const userId of userIds) {
          const profile = profileById.get(userId);
          if (!profile?.email) continue;
          const roles = recipients.get(userId)!;
          const isElder = roles.has("elder") || roles.has("elder_candidate");

          const mine = (actions ?? []).filter(
            (a: any) => !a.completed && a.assignee_id === userId,
          );
          const overdue = mine.filter((a: any) => a.due_date && a.due_date < todayStr);
          const dueSoon = mine.filter(
            (a: any) => a.due_date && a.due_date >= todayStr && a.due_date <= format(in7, "yyyy-MM-dd"),
          );

          const firstName = (profile.full_name ?? profile.email).split(" ")[0];
          const actionsHtml = mine.length
            ? `<h3 style="margin:20px 0 4px;">Your action items (${mine.length})</h3>
               ${overdue.length ? `<div style="color:#b91c1c;font-weight:600;margin-bottom:4px;">${overdue.length} overdue</div>` : ""}
               <ul style="padding-left:18px;margin:4px 0;">${mine
                 .slice(0, 8)
                 .map(
                   (a: any) =>
                     `<li>${escapeHtml(a.title)}${a.due_date ? ` <span style="color:#78716c;">— ${escapeHtml(format(new Date(a.due_date + "T12:00"), "MMM d"))}</span>` : ""}</li>`,
                 )
                 .join("")}</ul>
               ${dueSoon.length ? `<div style="color:#78716c;font-size:12px;">${dueSoon.length} due in next 7 days.</div>` : ""}`
            : "";

          const elderHtml =
            isElder && ((redCount ?? 0) > 0 || (amberCount ?? 0) > 0)
              ? `<h3 style="margin:20px 0 4px;">Pastoral attention</h3>
                 <div style="color:#57534e;">
                   ${(redCount ?? 0) > 0 ? `<span style="color:#b91c1c;font-weight:600;">${redCount} overdue 60+ days</span>` : ""}
                   ${(redCount ?? 0) > 0 && (amberCount ?? 0) > 0 ? " · " : ""}
                   ${(amberCount ?? 0) > 0 ? `<span style="color:#b45309;">${amberCount} in 45–60d window</span>` : ""}
                 </div>`
              : "";

          const html = emailLayout(
            "This week",
            `<p style="margin:0 0 12px;color:#57534e;">Good Monday, ${escapeHtml(firstName)} — here's what's on the radar.</p>
             <h3 style="margin:8px 0 4px;">Coming up (next 7 days)</h3>
             ${eventsHtml}
             ${actionsHtml}
             ${missionsHtml}
             ${elderHtml}`,
          );

          try {
            await sendEmail({
              to: profile.email,
              subject: `This week — ${format(today, "MMM d")}`,
              html,
            });
            sent++;
          } catch (e) {
            console.error("monday digest send failed for", profile.email, e);
          }
        }

        return Response.json({ ok: true, sent });
      },
    },
  },
});
