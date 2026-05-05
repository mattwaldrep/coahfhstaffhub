import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { format, subDays } from "date-fns";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail, emailLayout, escapeHtml } from "./email.server";

async function assertMeetingRole(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["core", "meeting"]);
  if (!data || data.length === 0) throw new Error("Forbidden: meeting role required");
}

export const finalizeMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ meetingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMeetingRole(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("meetings")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", data.meetingId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendMeetingRecap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ meetingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMeetingRole(context.supabase, context.userId);

    const [{ data: meeting }, { data: agenda }, { data: actions }, { data: sectionNotes }, { data: eventNotes }, { data: reviews }, { data: profiles }, { data: roles }] =
      await Promise.all([
        supabaseAdmin.from("meetings").select("*").eq("id", data.meetingId).single(),
        supabaseAdmin.from("agenda_items").select("*").eq("meeting_id", data.meetingId).order("position"),
        supabaseAdmin.from("action_items").select("*").eq("meeting_id", data.meetingId).order("created_at"),
        supabaseAdmin.from("meeting_section_notes").select("*").eq("meeting_id", data.meetingId),
        supabaseAdmin.from("meeting_event_notes").select("*, calendar_events(title, start_at)").eq("meeting_id", data.meetingId),
        supabaseAdmin.from("sunday_reviews").select("*").gte("service_date", format(subDays(new Date(), 14), "yyyy-MM-dd")).order("service_date", { ascending: false }),
        supabaseAdmin.from("profiles").select("id, full_name, email"),
        supabaseAdmin.from("user_roles").select("user_id, role").in("role", ["core", "meeting"]),
      ]);

    if (!meeting) throw new Error("Meeting not found");

    const recipientIds = new Set((roles ?? []).map((r: any) => r.user_id));
    const recipients = (profiles ?? [])
      .filter((p: any) => recipientIds.has(p.id) && p.email)
      .map((p: any) => p.email as string);
    if (recipients.length === 0) throw new Error("No staff recipients found");

    const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const sectionByKey = new Map((sectionNotes ?? []).map((s: any) => [s.section_key, s.notes]));
    const SECTION_LABELS: Record<string, string> = {
      devotional: "Devotional — Lead Like Jesus",
      sunday_review: "Sunday Review",
      first_step_cards: "First Step Cards",
      next_step_cards: "Next Step Cards",
      review_trends: "Review Trends",
    };

    const meetingDate = format(new Date(meeting.meeting_date + "T12:00"), "EEEE, MMMM d, yyyy");

    const sectionsHtml = Object.entries(SECTION_LABELS)
      .filter(([k]) => (sectionByKey.get(k) || "").toString().trim())
      .map(
        ([k, label]) => `
        <h3 style="margin:24px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:0.12em;color:#57534e;">${escapeHtml(label)}</h3>
        <div style="white-space:pre-wrap;">${escapeHtml(sectionByKey.get(k) as string)}</div>`,
      )
      .join("");

    const latestReviewDate = reviews?.[0]?.service_date;
    const sundayReview = latestReviewDate
      ? (reviews ?? []).filter((r: any) => r.service_date === latestReviewDate)
      : [];
    const sundayHtml = sundayReview.length
      ? `<h3 style="margin:24px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:0.12em;color:#57534e;">Sunday — ${escapeHtml(format(new Date(latestReviewDate + "T12:00"), "MMM d"))}</h3>
        <ul style="padding-left:18px;margin:6px 0;">
          ${sundayReview.flatMap((r: any) => [
            r.wins?.trim() ? `<li><strong>Win:</strong> ${escapeHtml(r.wins)}</li>` : "",
            r.opportunities?.trim() ? `<li><strong>Opportunity:</strong> ${escapeHtml(r.opportunities)}</li>` : "",
          ]).filter(Boolean).join("")}
        </ul>`
      : "";

    const eventNotesHtml = (eventNotes ?? []).filter((e: any) => e.notes?.trim()).length
      ? `<h3 style="margin:24px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:0.12em;color:#57534e;">Event Discussion</h3>
        <ul style="padding-left:18px;margin:6px 0;">
        ${(eventNotes ?? [])
          .filter((e: any) => e.notes?.trim())
          .map((e: any) => `<li><strong>${escapeHtml(e.calendar_events?.title ?? "Event")}</strong> (${escapeHtml(e.occurrence_date)}): ${escapeHtml(e.notes)}</li>`)
          .join("")}
        </ul>`
      : "";

    const agendaHtml = (agenda ?? []).length
      ? `<h3 style="margin:24px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:0.12em;color:#57534e;">Items Discussed</h3>
        <ul style="padding-left:18px;margin:6px 0;">
          ${(agenda ?? []).map((a: any) => `<li>${a.status === "done" ? "✓ " : ""}${escapeHtml(a.title)}${a.notes ? ` — <em>${escapeHtml(a.notes)}</em>` : ""}</li>`).join("")}
        </ul>`
      : "";

    const actionHtml = (actions ?? []).length
      ? `<h3 style="margin:24px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:0.12em;color:#57534e;">New Action Items</h3>
        <ul style="padding-left:18px;margin:6px 0;">
          ${(actions ?? []).map((a: any) => {
            const owner = a.assignee_id ? (profileById.get(a.assignee_id) as any) : null;
            const ownerName = owner?.full_name || owner?.email || "Unassigned";
            const due = a.due_date ? ` · due ${format(new Date(a.due_date + "T12:00"), "MMM d")}` : "";
            return `<li><strong>${escapeHtml(ownerName)}:</strong> ${escapeHtml(a.title)}${due}</li>`;
          }).join("")}
        </ul>`
      : "";

    const meetingNotesHtml = meeting.notes?.trim()
      ? `<h3 style="margin:24px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:0.12em;color:#57534e;">General Notes</h3>
         <div style="white-space:pre-wrap;">${escapeHtml(meeting.notes)}</div>`
      : "";

    const html = emailLayout(
      `Staff Meeting Recap — ${meetingDate}`,
      `<p style="margin:0 0 12px;color:#57534e;">Recap from today's weekly staff meeting.</p>
       ${sectionsHtml}
       ${sundayHtml}
       ${eventNotesHtml}
       ${agendaHtml}
       ${actionHtml}
       ${meetingNotesHtml}`,
    );

    await sendEmail({
      to: recipients,
      subject: `Staff Meeting Recap — ${format(new Date(meeting.meeting_date + "T12:00"), "MMM d")}`,
      html,
    });

    await supabaseAdmin
      .from("meetings")
      .update({ recap_sent_at: new Date().toISOString() })
      .eq("id", data.meetingId);

    return { ok: true, recipients: recipients.length };
  });
