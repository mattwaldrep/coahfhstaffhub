import { createFileRoute } from "@tanstack/react-router";
import { checkCronAuth } from "@/lib/cycle-hook-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { syncGoogleTaskCompletions } from "@/server/google-task-completion.server";

export const Route = createFileRoute("/api/public/hooks/sync-google-tasks")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkCronAuth(request);
        if (unauth) return unauth;
        const { data: integrations, error } = await supabaseAdmin
          .from("user_integrations")
          .select("user_id")
          .eq("provider", "google_tasks");
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const results: Array<{ userId: string; checked: number; updated: number; error?: string }> = [];
        for (const row of integrations ?? []) {
          try {
            const r = await syncGoogleTaskCompletions(row.user_id);
            results.push({ userId: row.user_id, ...r });
          } catch (e: any) {
            results.push({ userId: row.user_id, checked: 0, updated: 0, error: e.message ?? "failed" });
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            users: results.length,
            totalUpdated: results.reduce((s, r) => s + r.updated, 0),
            results,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
