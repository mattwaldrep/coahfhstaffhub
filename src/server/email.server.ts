// Server-only email sender via Resend connector gateway.
const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

export type SendEmailParams = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export async function sendEmail(params: SendEmailParams) {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");
  const FROM = process.env.EMAIL_FROM_ADDRESS;
  if (!FROM) throw new Error("EMAIL_FROM_ADDRESS is not configured");

  const res = await fetch(`${GATEWAY_URL}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": RESEND_API_KEY,
    },
    body: JSON.stringify({
      from: FROM,
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
      reply_to: params.replyTo,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Resend error [${res.status}]: ${JSON.stringify(data)}`);
  }
  return data as { id?: string };
}

export function emailLayout(title: string, bodyHtml: string) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1c1917;">
  <div style="max-width:640px;margin:0 auto;padding:32px 16px;">
    <div style="background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;overflow:hidden;">
      <div style="background:#0c0a09;color:#fafaf9;padding:20px 28px;">
        <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;opacity:0.7;">COAH Forest Hills Staff Hub</div>
        <div style="font-size:20px;font-weight:600;margin-top:4px;">${escapeHtml(title)}</div>
      </div>
      <div style="padding:24px 28px;font-size:14px;line-height:1.6;">
        ${bodyHtml}
      </div>
    </div>
    <div style="text-align:center;font-size:11px;color:#78716c;margin-top:16px;">
      Sent from the Staff Hub. Reply directly to discuss with the team.
    </div>
  </div>
</body></html>`;
}

export function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
