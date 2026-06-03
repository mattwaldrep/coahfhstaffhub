import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendMeetingRecapInternal } from "@/server/meeting-recap.server";

/**
 * Auto-finalize staff meetings that were started but never had the recap sent.
 *
 * Targets meetings whose meeting_date is today or earlier, where recap_sent_at
 * is null AND the meeting has activity (status in_progress/completed). Finalizes
 * any in_progress meeting and sends the recap.
 *
 * Intended to run via pg_cron a few hours after the typical staff meeting end.
 */
export const Route = createFileRoute("/api/public/hooks/auto-finalize-meeting")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        const expected = `Bearer ${process.env.CRON_SHARED_SECRET}`;
        if (!process.env.CRON_SHARED_SECRET || auth !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const today = format(new Date(), "yyyy-MM-dd");

        const { data: meetings, error } = await supabaseAdmin
          .from("meetings")
          .select("id, status, meeting_date, recap_sent_at")
          .lte("meeting_date", today)
          .is("recap_sent_at", null)
          .in("status", ["in_progress", "completed"]);

        if (error) {
          console.error("auto-finalize query failed", error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
        }

        const results: Array<{ id: string; ok: boolean; recipients?: number; error?: string }> = [];
        for (const m of meetings ?? []) {
          try {
            if (m.status === "in_progress") {
              await supabaseAdmin
                .from("meetings")
                .update({ status: "completed", completed_at: new Date().toISOString() })
                .eq("id", m.id);
            }
            const { recipients } = await sendMeetingRecapInternal(m.id);
            results.push({ id: m.id, ok: true, recipients });
          } catch (e: any) {
            console.error("auto-finalize failed for meeting", m.id, e);
            results.push({ id: m.id, ok: false, error: e?.message ?? String(e) });
          }
        }

        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});
