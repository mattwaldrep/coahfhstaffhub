/**
 * Weekly staff digest. Same body to every staff recipient.
 *
 * Triggered by:
 *   - pg_cron Sundays 19:00 (POST with `apikey` header set to the project anon key)
 *   - Admin "Send digest now" button (POST with bearer token from a core user)
 *
 * No PII leakage: only sends to authenticated staff emails fetched server-side.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/hooks/send-weekly-digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Apikey gate: must match SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY.
        const apikey = request.headers.get("apikey");
        const allowed = [
          process.env.SUPABASE_ANON_KEY,
          process.env.SUPABASE_PUBLISHABLE_KEY,
        ].filter(Boolean) as string[];
        if (!apikey || !allowed.includes(apikey)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const resendKey = process.env.RESEND_API_KEY;
        const from = process.env.EMAIL_FROM_ADDRESS;
        if (!resendKey || !from) {
          return new Response("Email not configured", { status: 500 });
        }

        // ---- Gather digest data ----
        const now = new Date();
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const [eventsRes, actionsRes, recipientsRes] = await Promise.all([
          supabaseAdmin
            .from("calendar_events")
            .select("title, start_at, category, leader_name, childcare_needed, childcare_arranged, room_needed")
            .gte("start_at", now.toISOString())
            .lt("start_at", weekEnd.toISOString())
            .order("start_at"),
          supabaseAdmin
            .from("action_items")
            .select("title, due_date, completed")
            .eq("completed", false)
            .order("due_date", { ascending: true, nullsFirst: false }),
          supabaseAdmin
            .from("user_roles")
            .select("user_id, role")
            .in("role", ["core", "meeting"]),
        ]);

        const events = eventsRes.data ?? [];
        const actions = actionsRes.data ?? [];
        const userIds = Array.from(new Set((recipientsRes.data ?? []).map((r) => r.user_id)));
        if (!userIds.length) {
          return Response.json({ sent: 0, reason: "no staff" });
        }
        const profilesRes = await supabaseAdmin
          .from("profiles")
          .select("email, full_name")
          .in("id", userIds);
        const emails = (profilesRes.data ?? [])
          .map((p) => p.email)
          .filter((e): e is string => !!e);
        if (!emails.length) return Response.json({ sent: 0, reason: "no emails" });

        // ---- Build assignments by role ----
        const nudgesRes = await supabaseAdmin
          .from("sunday_review_nudges")
          .select("role, section")
          .eq("active", true);
        const nudges = nudgesRes.data ?? [];

        // ---- Build HTML body ----
        const gaps = events.filter(
          (e) =>
            e.sub_calendar === "classes" &&
            (!e.leader_name || (e.childcare_needed && !e.childcare_arranged)),
        );

        const html = `
<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1f2937">
  <h1 style="font-size:20px;margin-bottom:4px">This week at COAH</h1>
  <p style="color:#6b7280;margin-top:0">Weekly staff digest · ${now.toDateString()}</p>

  <h2 style="font-size:16px;border-bottom:1px solid #e5e7eb;padding-bottom:4px">Coming up (next 7 days)</h2>
  ${
    events.length === 0
      ? `<p style="color:#6b7280">No events scheduled.</p>`
      : `<ul>${events
          .map(
            (e) =>
              `<li><strong>${escape(e.title)}</strong> — ${new Date(e.start_at).toLocaleString()} ${
                e.leader_name ? `· ${escape(e.leader_name)}` : ""
              }</li>`,
          )
          .join("")}</ul>`
  }

  <h2 style="font-size:16px;border-bottom:1px solid #e5e7eb;padding-bottom:4px">Classes still needing attention</h2>
  ${
    gaps.length === 0
      ? `<p style="color:#16a34a">All classes set. 🎉</p>`
      : `<ul>${gaps
          .map(
            (e) =>
              `<li>${escape(e.title)} — ${
                !e.leader_name ? "needs teacher" : ""
              }${!e.leader_name && e.childcare_needed && !e.childcare_arranged ? " · " : ""}${
                e.childcare_needed && !e.childcare_arranged ? "needs childcare" : ""
              }</li>`,
          )
          .join("")}</ul>`
  }

  <h2 style="font-size:16px;border-bottom:1px solid #e5e7eb;padding-bottom:4px">Open action items</h2>
  ${
    actions.length === 0
      ? `<p style="color:#16a34a">No open action items.</p>`
      : `<ul>${actions
          .slice(0, 10)
          .map(
            (a) =>
              `<li>${escape(a.title)}${a.due_date ? ` <span style="color:#6b7280">· due ${a.due_date}</span>` : ""}</li>`,
          )
          .join("")}</ul>`
  }

  ${
    nudges.length
      ? `<h2 style="font-size:16px;border-bottom:1px solid #e5e7eb;padding-bottom:4px">Sunday Review owners</h2>
         <ul>${nudges.map((n) => `<li><strong>${n.role}</strong> — ${escape(n.section)}</li>`).join("")}</ul>`
      : ""
  }

  <p style="color:#9ca3af;font-size:12px;margin-top:24px">Sent automatically from the Staff Hub.</p>
</body></html>
        `.trim();

        // ---- Send via Resend (one request, BCC all staff) ----
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: [from],
            bcc: emails,
            subject: `Staff digest — week of ${now.toLocaleDateString()}`,
            html,
          }),
        });

        if (!resp.ok) {
          const body = await resp.text();
          return new Response(`Resend error: ${body}`, { status: 502 });
        }

        return Response.json({ sent: emails.length, events: events.length, actions: actions.length, gaps: gaps.length });
      },
    },
  },
});

function escape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
