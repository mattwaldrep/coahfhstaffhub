/**
 * Shared apikey auth for /api/public/hooks/* cron routes.
 */
export function checkCronAuth(request: Request): Response | null {
  const apikey = request.headers.get("apikey");
  const allowed = [
    process.env.SUPABASE_ANON_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
  ].filter(Boolean) as string[];
  if (!apikey || !allowed.includes(apikey)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
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
