import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GOOGLE_SCOPE = "https://www.googleapis.com/auth/tasks openid email";

function getOAuthEnv() {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Google OAuth client not configured");
  return { id, secret };
}

export const getGoogleAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ origin: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    const { id } = getOAuthEnv();
    const redirectUri = `${data.origin}/api/google/oauth-callback`;
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", id);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_SCOPE);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", context.userId);
    return { url: url.toString(), redirectUri };
  });

export const getGoogleConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("user_integrations")
      .select("provider, scope, expires_at, created_at, updated_at")
      .eq("user_id", context.userId)
      .eq("provider", "google_tasks")
      .maybeSingle();
    return data ? { connected: true, ...data } : { connected: false };
  });

export const disconnectGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await supabaseAdmin
      .from("user_integrations")
      .delete()
      .eq("user_id", context.userId)
      .eq("provider", "google_tasks");
    return { ok: true };
  });

async function refreshAccessToken(refreshToken: string) {
  const { id, secret } = getOAuthEnv();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Google token refresh failed: ${JSON.stringify(data)}`);
  return data as { access_token: string; expires_in: number };
}

async function ensureAccessToken(userId: string): Promise<string> {
  const { data: row } = await supabaseAdmin
    .from("user_integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "google_tasks")
    .maybeSingle();
  if (!row) throw new Error("User has not connected Google Tasks");
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (row.access_token && expiresAt > Date.now() + 60_000) return row.access_token;
  const refreshed = await refreshAccessToken(row.refresh_token);
  const newExpires = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await supabaseAdmin
    .from("user_integrations")
    .update({ access_token: refreshed.access_token, expires_at: newExpires })
    .eq("user_id", userId)
    .eq("provider", "google_tasks");
  return refreshed.access_token;
}

export const pushActionItemToGoogleTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ actionItemId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: item, error } = await supabaseAdmin
      .from("action_items")
      .select("*")
      .eq("id", data.actionItemId)
      .single();
    if (error || !item) throw new Error("Action item not found");
    const targetUser = item.assignee_id ?? context.userId;

    const accessToken = await ensureAccessToken(targetUser);

    const body: Record<string, any> = { title: item.title };
    if (item.notes) body.notes = item.notes;
    if (item.due_date) body.due = `${item.due_date}T00:00:00.000Z`;

    const res = await fetch("https://tasks.googleapis.com/tasks/v1/lists/@default/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(`Google Tasks API error: ${JSON.stringify(result)}`);

    await supabaseAdmin
      .from("action_items")
      .update({
        google_task_id: result.id,
        google_task_pushed_at: new Date().toISOString(),
        google_task_pushed_by: context.userId,
      })
      .eq("id", item.id);

    return { ok: true, taskId: result.id };
  });
