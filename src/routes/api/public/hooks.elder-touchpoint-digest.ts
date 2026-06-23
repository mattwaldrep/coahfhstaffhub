/**
 * Weekly elder touchpoint digest — per-elder list of their red/amber people.
 * pg_cron: Mondays at 12:00 UTC.
 * Auth: Bearer ${CRON_SHARED_SECRET}.
 */
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchCareList } from "@/server/pco.server";
import { sendEmail, emailLayout, escapeHtml } from "@/server/email.server";

export const Route = createFileRoute("/api/public/hooks/elder-touchpoint-digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        const expected = `Bearer ${process.env.CRON_SHARED_SECRET}`;
        if (!process.env.CRON_SHARED_SECRET || auth !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { data: cfg } = await supabaseAdmin
          .from("elder_pco_config")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!cfg?.list_id || !cfg?.assigned_elder_field_id) {
          return Response.json({ skipped: "not configured" });
        }

        const people = await fetchCareList({
          list_id: cfg.list_id,
          field_ids: [cfg.assigned_elder_field_id],
        });
        const ids = people.map((p) => p.id);
        if (ids.length === 0) return Response.json({ sent: 0 });

        const [{ data: tps }, { data: notes }] = await Promise.all([
          supabaseAdmin
            .from("pco_touchpoints")
            .select("pco_person_id, created_at")
            .in("pco_person_id", ids),
          supabaseAdmin
            .from("pco_pastoral_notes")
            .select("pco_person_id, created_at")
            .in("pco_person_id", ids),
        ]);
        const last: Record<string, number> = {};
        for (const r of [...(tps ?? []), ...(notes ?? [])] as any[]) {
          const t = new Date(r.created_at).getTime();
          if (!last[r.pco_person_id] || t > last[r.pco_person_id]) last[r.pco_person_id] = t;
        }

        type Entry = { name: string; days: number | null; level: "red" | "amber" };
        const byElder = new Map<string, Entry[]>();
        const now = Date.now();
        const elderField = cfg.assigned_elder_field_id as string;
        for (const p of people) {
          const elder = (p.fields[elderField]?.value ?? "").toString().trim();
          if (!elder) continue;
          const ts = last[p.id];
          const days = ts ? Math.floor((now - ts) / 86400000) : null;
          let level: "red" | "amber" | null = null;
          if (days === null || days >= 60) level = "red";
          else if (days >= 45) level = "amber";
          if (!level) continue;
          const key = elder.toLowerCase();
          if (!byElder.has(key)) byElder.set(key, []);
          byElder.get(key)!.push({ name: p.name, days, level });
        }
        if (byElder.size === 0) return Response.json({ sent: 0 });

        // Map elder name -> profile email via profiles.full_name
        const elderNames = Array.from(byElder.keys());
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("full_name, email");
        const emailByName = new Map<string, string>();
        for (const p of profiles ?? []) {
          if (p.full_name && p.email) emailByName.set(p.full_name.trim().toLowerCase(), p.email);
        }

        const today = new Date();
        let sent = 0;
        for (const [key, entries] of byElder) {
          const email = emailByName.get(key);
          if (!email) continue;
          const reds = entries
            .filter((e) => e.level === "red")
            .sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999));
          const ambers = entries.filter((e) => e.level === "amber").sort((a, b) => (b.days ?? 0) - (a.days ?? 0));

          const fmtList = (items: Entry[]) =>
            `<ul style="padding-left:18px;margin:4px 0;">${items
              .map(
                (e) =>
                  `<li>${escapeHtml(e.name)} <span style="color:#78716c;">— ${e.days === null ? "no contact on record" : `${e.days}d`}</span></li>`,
              )
              .join("")}</ul>`;

          const html = emailLayout(
            "Pastoral touchpoint digest",
            `<p style="margin:0 0 12px;color:#57534e;">Here's where folks assigned to you stand this week.</p>
             ${reds.length ? `<h3 style="color:#b91c1c;margin:20px 0 4px;">Overdue 60+ days (${reds.length})</h3>${fmtList(reds)}` : ""}
             ${ambers.length ? `<h3 style="color:#b45309;margin:20px 0 4px;">45–60 day window (${ambers.length})</h3>${fmtList(ambers)}` : ""}
             <p style="color:#78716c;font-size:12px;margin-top:20px;">Even a brief text or call reset the clock. Log it in the Staff Hub when you connect.</p>`,
          );

          try {
            await sendEmail({
              to: email,
              subject: `Pastoral digest — ${format(today, "MMM d")}`,
              html,
            });
            sent++;
          } catch (e) {
            console.error("elder digest send failed for", email, e);
          }
        }

        return Response.json({ ok: true, sent, elders: byElder.size });
      },
    },
  },
});
