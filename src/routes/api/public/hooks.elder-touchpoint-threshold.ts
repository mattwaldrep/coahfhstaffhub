/**
 * Daily threshold alert — emails an elder when one of their people first
 * crosses the 45-day or 60-day threshold. De-duplicated via
 * elder_threshold_notifications so each (person, threshold) only fires once
 * per crossing. Resets when a fresh touchpoint brings days back below 45.
 *
 * pg_cron: Daily 13:00 UTC (8am EST).
 * Auth: Bearer ${CRON_SHARED_SECRET}.
 */
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchCareList } from "@/server/pco.server";
import { sendEmail, emailLayout, escapeHtml } from "@/server/email.server";

export const Route = createFileRoute("/api/public/hooks/elder-touchpoint-threshold")({
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
        if (!ids.length) return Response.json({ sent: 0 });

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

        const { data: prevAll } = await supabaseAdmin
          .from("elder_threshold_notifications")
          .select("pco_person_id, threshold, last_notified_days");
        const prev = new Map<string, { threshold: number; last_notified_days: number }>();
        for (const r of prevAll ?? []) {
          prev.set(`${r.pco_person_id}:${r.threshold}`, {
            threshold: r.threshold,
            last_notified_days: r.last_notified_days,
          });
        }

        const elderField = cfg.assigned_elder_field_id as string;
        const now = Date.now();

        type Alert = { person_id: string; name: string; elder: string; days: number | null; threshold: 45 | 60 };
        const alerts: Alert[] = [];
        const resets: string[] = [];

        for (const p of people) {
          const elder = (p.fields[elderField]?.value ?? "").toString().trim();
          if (!elder) continue;
          const ts = last[p.id];
          const days = ts ? Math.floor((now - ts) / 86400000) : null;

          // Reset: if back below 45, clear any prior notifications for this person.
          if (days !== null && days < 45) {
            if (prev.has(`${p.id}:45`) || prev.has(`${p.id}:60`)) resets.push(p.id);
            continue;
          }

          const crossed: (45 | 60)[] = [];
          if (days === null || days >= 60) crossed.push(60);
          else if (days >= 45) crossed.push(45);

          for (const threshold of crossed) {
            if (prev.has(`${p.id}:${threshold}`)) continue; // already notified for this crossing
            alerts.push({ person_id: p.id, name: p.name, elder, days, threshold });
          }
        }

        if (resets.length) {
          await supabaseAdmin
            .from("elder_threshold_notifications")
            .delete()
            .in("pco_person_id", resets);
        }

        if (alerts.length === 0) return Response.json({ sent: 0, resets: resets.length });

        // Email map
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("full_name, email");
        const emailByName = new Map<string, string>();
        for (const p of profiles ?? []) {
          if (p.full_name && p.email) emailByName.set(p.full_name.trim().toLowerCase(), p.email);
        }

        // Group alerts by elder
        const byElder = new Map<string, Alert[]>();
        for (const a of alerts) {
          const key = a.elder.toLowerCase();
          if (!byElder.has(key)) byElder.set(key, []);
          byElder.get(key)!.push(a);
        }

        const today = new Date();
        let sent = 0;
        const recordRows: any[] = [];

        for (const [key, list] of byElder) {
          const email = emailByName.get(key);
          if (!email) {
            // Still record so we don't keep retrying when no email mapping exists.
            for (const a of list) {
              recordRows.push({
                pco_person_id: a.person_id,
                threshold: a.threshold,
                last_notified_days: a.days ?? 9999,
              });
            }
            continue;
          }

          const reds = list.filter((a) => a.threshold === 60);
          const ambers = list.filter((a) => a.threshold === 45);

          const fmt = (items: Alert[]) =>
            `<ul style="padding-left:18px;margin:4px 0;">${items
              .map(
                (a) =>
                  `<li>${escapeHtml(a.name)} <span style="color:#78716c;">— ${a.days === null ? "no contact on record" : `${a.days}d`}</span></li>`,
              )
              .join("")}</ul>`;

          const html = emailLayout(
            "Pastoral threshold alert",
            `<p style="margin:0 0 12px;color:#57534e;">A heads-up — these folks assigned to you just crossed a threshold.</p>
             ${reds.length ? `<h3 style="color:#b91c1c;margin:20px 0 4px;">Crossed 60 days (${reds.length})</h3>${fmt(reds)}` : ""}
             ${ambers.length ? `<h3 style="color:#b45309;margin:20px 0 4px;">Crossed 45 days (${ambers.length})</h3>${fmt(ambers)}` : ""}
             <p style="color:#78716c;font-size:12px;margin-top:20px;">A short reach-out resets the clock.</p>`,
          );

          try {
            await sendEmail({
              to: email,
              subject: `Pastoral alert — ${reds.length ? `${reds.length} at 60d` : `${ambers.length} at 45d`}`,
              html,
            });
            sent++;
            for (const a of list) {
              recordRows.push({
                pco_person_id: a.person_id,
                threshold: a.threshold,
                last_notified_days: a.days ?? 9999,
              });
            }
          } catch (e) {
            console.error("threshold alert send failed for", email, e);
          }
        }

        if (recordRows.length) {
          await supabaseAdmin
            .from("elder_threshold_notifications")
            .upsert(recordRows, { onConflict: "pco_person_id,threshold" });
        }

        return Response.json({ ok: true, sent, alerts: alerts.length, resets: resets.length });
      },
    },
  },
});
