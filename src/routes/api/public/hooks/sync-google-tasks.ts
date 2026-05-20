import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ensureAccessTokenForUser } from "@/server/google-tasks.server";

type GoogleTask = {
  id: string;
  status?: "needsAction" | "completed";
  completed?: string | null;
};

async function syncUser(userId: string) {
  // Fetch all action items for this user (assignee) that were pushed to Google
  const { data: items, error } = await supabaseAdmin
    .from("action_items")
    .select("id, completed, google_task_id")
    .eq("assignee_id", userId)
    .not("google_task_id", "is", null);
  if (error) throw new Error(error.message);
  if (!items || items.length === 0) return { checked: 0, updated: 0 };

  let accessToken: string;
  try {
    accessToken = await ensureAccessTokenForUser(userId);
  } catch (e: any) {
    return { checked: 0, updated: 0, error: e.message ?? "token" };
  }

  // Page through tasks including completed + hidden
  const tasksById = new Map<string, GoogleTask>();
  let pageToken: string | undefined;
  do {
    const url = new URL("https://tasks.googleapis.com/tasks/v1/lists/@default/tasks");
    url.searchParams.set("showCompleted", "true");
    url.searchParams.set("showHidden", "true");
    url.searchParams.set("maxResults", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json: any = await res.json();
    if (!res.ok) throw new Error(`Google list failed: ${JSON.stringify(json)}`);
    for (const t of json.items ?? []) tasksById.set(t.id, t);
    pageToken = json.nextPageToken;
  } while (pageToken);

  let updated = 0;
  for (const item of items) {
    const t = tasksById.get(item.google_task_id!);
    if (!t) continue;
    const isCompleted = t.status === "completed";
    if (isCompleted !== item.completed) {
      const { error: upErr } = await supabaseAdmin
        .from("action_items")
        .update({ completed: isCompleted })
        .eq("id", item.id);
      if (!upErr) updated++;
    }
  }
  return { checked: items.length, updated };
}

export const Route = createFileRoute("/api/public/hooks/sync-google-tasks")({
  server: {
    handlers: {
      POST: async () => {
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
            const r = await syncUser(row.user_id);
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
