/**
 * Shared auth for /api/public/hooks/* cron routes.
 * Accepts only `Authorization: Bearer ${CRON_SHARED_SECRET}` (pg_cron via vault).
 */
export function checkCronAuth(request: Request): Response | null {
  const secret = process.env.CRON_SHARED_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

/**
 * Accepts the cron secret OR a signed-in user's bearer token that holds the Core role.
 */
export async function checkCronOrCoreAuth(request: Request): Promise<Response | null> {
  if (!checkCronAuth(request)) return null;
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
  const token = auth.slice(7);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !token) return new Response("Unauthorized", { status: 401 });
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data } = await sb.auth.getClaims(token);
  const uid = data?.claims?.sub;
  if (!uid) return new Response("Unauthorized", { status: 401 });
  const { data: role } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", uid)
    .eq("role", "core")
    .maybeSingle();
  if (!role) return new Response("Forbidden", { status: 403 });
  return null;
}

export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendCoreEmail(opts: {
  subject: string;
  html: string;
  bcc?: string[];
}): Promise<number> {
  const from = process.env.EMAIL_FROM_ADDRESS;
  const key = process.env.RESEND_API_KEY;
  if (!from || !key || !opts.bcc || opts.bcc.length === 0) return 0;
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [from],
      bcc: opts.bcc,
      subject: opts.subject,
      html: opts.html,
    }),
  });
  return resp.ok ? opts.bcc.length : 0;
}
