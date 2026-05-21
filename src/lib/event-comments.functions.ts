import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail, emailLayout, escapeHtml } from "@/server/email.server";

function appUrl(path: string): string {
  const base = process.env.APP_PUBLIC_URL ?? "https://coahfhstaffhub.lovable.app";
  return `${base.replace(/\/$/, "")}${path}`;
}

export const notifyCommentMentions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      eventId: z.string().uuid(),
      commentBody: z.string().min(1).max(5000),
      mentionedUserIds: z.array(z.string().uuid()).min(1).max(20),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const [{ data: event }, { data: author }, { data: recipients }] = await Promise.all([
      supabaseAdmin.from("calendar_events").select("id,title").eq("id", data.eventId).maybeSingle(),
      supabaseAdmin.from("profiles").select("full_name,email").eq("id", userId).maybeSingle(),
      supabaseAdmin.from("profiles").select("id,email,full_name").in("id", data.mentionedUserIds),
    ]);

    if (!event) return { sent: 0 };
    const toList = (recipients ?? []).filter((r: any) => r.email && r.id !== userId);
    if (toList.length === 0) return { sent: 0 };

    const authorName = (author as any)?.full_name || (author as any)?.email || "Someone";
    const url = appUrl(`/calendar?event=${event.id}`);
    const html = emailLayout(
      `${authorName} mentioned you in a comment`,
      `<p><strong>${escapeHtml(authorName)}</strong> mentioned you on <strong>${escapeHtml(event.title)}</strong>:</p>
       <blockquote style="border-left:3px solid #d6d3d1;padding:8px 12px;margin:12px 0;color:#44403c;white-space:pre-wrap;">${escapeHtml(data.commentBody)}</blockquote>
       <p style="margin-top:20px;"><a href="${url}" style="background:#0c0a09;color:#fafaf9;padding:10px 18px;border-radius:8px;text-decoration:none;">Open event</a></p>`,
    );

    const results = await Promise.allSettled(
      toList.map((r: any) =>
        sendEmail({ to: r.email, subject: `${authorName} mentioned you: ${event.title}`, html }),
      ),
    );
    return { sent: results.filter((r) => r.status === "fulfilled").length };
  });
