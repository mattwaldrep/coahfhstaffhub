// Server-only helpers for sending calendar planning notifications.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail, emailLayout, escapeHtml } from "./email.server";

function appUrl(path: string): string {
  const base = process.env.APP_PUBLIC_URL ?? "https://coahfhstaffhub.lovable.app";
  return `${base.replace(/\/$/, "")}${path}`;
}

async function getStaffEmails(): Promise<string[]> {
  // Anyone with a role beyond default — leaders likely to plan
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role, profiles:profiles!user_id(email)")
    .in("role", ["core", "meeting", "extended"]);
  const emails = new Set<string>();
  for (const r of (data as any[]) ?? []) {
    const e = r.profiles?.email;
    if (e) emails.add(e);
  }
  return Array.from(emails);
}

async function getCoreEmails(): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, profiles:profiles!user_id(email)")
    .eq("role", "core");
  const emails = new Set<string>();
  for (const r of (data as any[]) ?? []) {
    const e = r.profiles?.email;
    if (e) emails.add(e);
  }
  return Array.from(emails);
}

export async function notifyCycleOpen(cycle: {
  id: string;
  title: string;
  closes_at: string;
}) {
  const recipients = await getStaffEmails();
  if (recipients.length === 0) return;
  const url = appUrl("/calendar/planning");
  const closes = new Date(cycle.closes_at).toLocaleDateString();
  const html = emailLayout(
    "Annual calendar planning is open",
    `<p><strong>${escapeHtml(cycle.title)}</strong> is open for planning.</p>
     <p>Submit your sub-calendar plan by <strong>${escapeHtml(closes)}</strong>. You can see other ministries' submitted plans as you work to avoid double-booking.</p>
     <p style="margin-top:20px;"><a href="${url}" style="background:#0c0a09;color:#fafaf9;padding:10px 18px;border-radius:8px;text-decoration:none;">Open planning</a></p>`,
  );
  // Fire-and-forget; do not let one bounce kill the rest.
  await Promise.allSettled(
    recipients.map((to) =>
      sendEmail({ to, subject: `Annual planning open: ${cycle.title}`, html }),
    ),
  );
}

export async function notifySubmissionReady(submissionId: string) {
  const { data: sub } = await supabaseAdmin
    .from("calendar_plan_submissions")
    .select("id, sub_calendar, leader_id, profiles:profiles!leader_id(full_name, email)")
    .eq("id", submissionId)
    .maybeSingle();
  if (!sub) return;
  const recipients = await getCoreEmails();
  if (recipients.length === 0) return;
  const leaderName = (sub as any).profiles?.full_name ?? (sub as any).profiles?.email ?? "A leader";
  const url = appUrl("/calendar/planning/review");
  const html = emailLayout(
    "Calendar plan ready for review",
    `<p><strong>${escapeHtml(leaderName)}</strong> just submitted their <strong>${escapeHtml(String(sub.sub_calendar).replace(/_/g, " "))}</strong> plan.</p>
     <p style="margin-top:20px;"><a href="${url}" style="background:#0c0a09;color:#fafaf9;padding:10px 18px;border-radius:8px;text-decoration:none;">Review submissions</a></p>`,
  );
  await Promise.allSettled(
    recipients.map((to) => sendEmail({ to, subject: `Plan submitted: ${leaderName}`, html })),
  );
}
