import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { format } from "date-fns";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import { supabaseAdmin, assertFullElder } from "@/server/elder.server";

async function loadRecipients(meetingType: string) {
  const roles = (meetingType === "joint"
    ? ["elder", "elder_candidate", "deacon", "chair_of_deacons"]
    : ["elder", "elder_candidate"]) as ("elder" | "elder_candidate" | "deacon" | "chair_of_deacons")[];
  const { data: roleRows } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role")
    .in("role", roles);
  const ids = Array.from(new Set((roleRows ?? []).map((r: any) => r.user_id)));
  if (!ids.length) return [] as { id: string; name: string; email: string; role: string }[];
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email")
    .in("id", ids);
  const roleOf = (id: string) => {
    const mine = (roleRows ?? []).filter((r: any) => r.user_id === id).map((r: any) => r.role);
    if (mine.includes("elder")) return "Elder";
    if (mine.includes("elder_candidate")) return "Elder candidate";
    if (mine.includes("chair_of_deacons")) return "Chair of deacons";
    return "Deacon";
  };
  return (profiles ?? [])
    .filter((p: any) => !!p.email)
    .map((p: any) => ({
      id: p.id,
      name: (p.full_name ?? p.email).trim(),
      email: p.email as string,
      role: roleOf(p.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Who would receive the agenda for this meeting. */
export const listAgendaRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ meeting_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertFullElder(context.supabase, context.userId);
    const { data: meeting } = await supabaseAdmin
      .from("elder_meetings")
      .select("meeting_type")
      .eq("id", data.meeting_id)
      .maybeSingle();
    if (!meeting) throw new Error("Meeting not found");
    return loadRecipients(meeting.meeting_type);
  });

/** Build the agenda PDF and email it to elders (and deacons for joint meetings). */
export const sendElderAgenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        meeting_id: z.string().uuid(),
        note: z.string().max(2000).nullable().optional(),
        recipient_ids: z.array(z.string().uuid()).max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertFullElder(context.supabase, context.userId);

    const { data: meeting } = await supabaseAdmin
      .from("elder_meetings")
      .select("id, title, meeting_date, meeting_type, location, start_time")
      .eq("id", data.meeting_id)
      .maybeSingle();
    if (!meeting) throw new Error("Meeting not found");

    const [{ data: agenda }, { data: jointItems }] = await Promise.all([
      supabaseAdmin
        .from("elder_agenda_items")
        .select("section_key, title, body, position, executive_session")
        .eq("meeting_id", data.meeting_id)
        .order("position"),
      supabaseAdmin
        .from("elder_joint_deacon_items")
        .select("sub_section, title, body, position, executive_session")
        .eq("meeting_id", data.meeting_id)
        .order("position"),
    ]);

    let recipients = await loadRecipients(meeting.meeting_type);
    if (data.recipient_ids?.length) {
      const keep = new Set(data.recipient_ids);
      recipients = recipients.filter((r) => keep.has(r.id));
    }
    if (!recipients.length) throw new Error("No recipients with an email address");

    const { buildAgendaPdf, toPlainText } = await import("@/server/elder-agenda-pdf.server");
    const { sendEmail, emailLayout, escapeHtml } = await import("@/server/email.server");

    const { base64, filename } = await buildAgendaPdf({
      meeting: meeting as any,
      agenda: (agenda ?? []) as any,
      jointItems: (jointItems ?? []) as any,
      note: data.note ?? null,
    });

    const dateLabel = format(new Date(`${meeting.meeting_date}T00:00:00`), "EEEE, MMMM d, yyyy");
    const isJoint = meeting.meeting_type === "joint";
    const title = meeting.title ?? (isJoint ? "Joint Elder/Deacon Meeting" : "Elder Meeting");

    const visible = (agenda ?? []).filter(
      (a: any) => !a.executive_session && a.section_key !== "executive",
    );
    const jointVisible = (jointItems ?? []).filter((j: any) => !j.executive_session);
    const bullets = [...visible, ...(isJoint ? jointVisible : [])]
      .map((i: any) => `<li style="margin-bottom:4px;">${escapeHtml(i.title)}</li>`)
      .join("");

    const html = emailLayout(
      `Agenda — ${title}`,
      `
        <p style="margin-top:0;"><strong>${escapeHtml(title)}</strong><br>
        ${escapeHtml(dateLabel)}${meeting.start_time ? ` · ${escapeHtml(meeting.start_time)}` : ""}${
          meeting.location ? ` · ${escapeHtml(meeting.location)}` : ""
        }</p>
        ${
          data.note && data.note.trim()
            ? `<p style="background:#f5f5f4;border-radius:8px;padding:12px 14px;">${escapeHtml(
                toPlainText(data.note),
              ).replace(/\n/g, "<br>")}</p>`
            : ""
        }
        <p>The full agenda is attached as a PDF. Here's a quick look:</p>
        ${bullets ? `<ul style="padding-left:18px;">${bullets}</ul>` : "<p><em>No agenda items yet.</em></p>"}
        <p style="color:#78716c;font-size:12px;">Executive Session items are not included in this agenda.</p>
      `,
    );

    let sent = 0;
    const failures: string[] = [];
    for (const r of recipients) {
      try {
        await sendEmail({
          to: r.email,
          subject: `Agenda — ${title}, ${format(new Date(`${meeting.meeting_date}T00:00:00`), "MMM d")}`,
          html,
          attachments: [{ filename, content: base64 }],
        });
        sent += 1;
      } catch {
        failures.push(r.email);
      }
    }

    return { sent, failures };
  });
