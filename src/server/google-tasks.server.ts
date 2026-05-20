import { supabaseAdmin } from "@/integrations/supabase/client.server";

function getOAuthEnv() {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Google OAuth client not configured");
  return { id, secret };
}

export async function refreshAccessToken(refreshToken: string) {
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

export async function ensureAccessTokenForUser(userId: string): Promise<string> {
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
