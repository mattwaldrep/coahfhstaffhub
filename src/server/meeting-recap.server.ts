import { format, subDays, addDays } from "date-fns";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail, emailLayout, escapeHtml } from "@/server/email.server";

/** Convert rich-text HTML (from the in-app editor) into clean plain text. */
function stripHtml(input: string | null | undefined): string {
  if (!input) return "";
  let s = String(input);
  if (!/<[a-z/][\s\S]*>/i.test(s)) return s.trim();
  s = s
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n• ")
    .replace(/<\s*\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l, i, arr) => l !== "" || (i > 0 && arr[i - 1] !== ""))
    .join("\n")
    .trim();
}

/** Escape rich-text HTML for email output as plain text. */
function rt(input: string | null | undefined): string {
  return escapeHtml(stripHtml(input));
}

/**
 * Build and send the staff meeting recap email, then stamp recap_sent_at.
 * Used by both the user-triggered server function and the auto-finalize cron hook.
 */
export async function sendMeetingRecapInternal(meetingId: string): Promise<{ recipients: number }> {
  const nowISO = new Date().toISOString();
  const in7ISO = addDays(new Date(), 7).toISOString();

  const [
    { data: meeting },
    { data: agenda },
    { data: actions },
    { data: sectionNotes },
    { data: eventNotes },
    { data: reviews },
    { data: profiles },
    { data: roles },
    { data: decisions },
    { data: upcoming },
  ] = await Promise.all([
    supabaseAdmin.from("meetings").select("*").eq("id", meetingId).single(),
    supabaseAdmin.from("agenda_items").select("*").eq("meeting_id", meetingId).order("position"),
    supabaseAdmin.from("action_items").select("*").eq("meeting_id", meetingId).order("created_at"),
    supabaseAdmin.from("meeting_section_notes").select("*").eq("meeting_id", meetingId),
    supabaseAdmin.from("meeting_event_notes").select("*, calendar_events(title, start_at)").eq("meeting_id", meetingId),
    supabaseAdmin.from("sunday_reviews").select("*").gte("service_date", format(subDays(new Date(), 14), "yyyy-MM-dd")).order("service_date", { ascending: false }),
    supabaseAdmin.from("profiles").select("id, full_name, email"),
    supabaseAdmin.from("user_roles").select("user_id, role").in("role", ["core", "meeting"]),
    supabaseAdmin.from("decisions").select("title, outcome, motion_text, vote_yes, vote_no, vote_abstain, decided_at").eq("meeting_id", meetingId).order("decided_at", { ascending: true }),
    supabaseAdmin.from("calendar_events").select("title, start_at, sub_calendar, leader_name").gte("start_at", nowISO).lte("start_at", in7ISO).order("start_at", { ascending: true }).limit(20),
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

  // ---- Counts & duration ----
  const agendaDone = (agenda ?? []).filter((a: any) => a.status === "done").length;
  const agendaTotal = (agenda ?? []).length;
  const actionCount = (actions ?? []).length;
  const decisionCount = (decisions ?? []).length;
  const openActionCount = (actions ?? []).filter((a: any) => !a.completed).length;

  let durationLabel = "";
  if (meeting.created_at && meeting.completed_at) {
    const mins = Math.max(
      1,
      Math.round((new Date(meeting.completed_at).getTime() - new Date(meeting.created_at).getTime()) / 60000),
    );
    if (mins <= 8 * 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      durationLabel = h ? `${h}h ${m}m` : `${m}m`;
    }
  }

  // ---- AI executive summary ----
  const summaryFacts: string[] = [];
  if (agendaTotal) summaryFacts.push(`Agenda: ${agendaDone}/${agendaTotal} items completed.`);
  if (decisionCount) {
    summaryFacts.push(
      `Decisions: ${(decisions ?? [])
        .map((d: any) => `${d.title} (${d.outcome})`)
        .join("; ")}.`,
    );
  }
  if (actionCount) summaryFacts.push(`New action items: ${actionCount} (${openActionCount} open).`);
  for (const [k, label] of Object.entries(SECTION_LABELS)) {
    const note = (sectionByKey.get(k) || "").toString().trim();
    if (note) summaryFacts.push(`${label}: ${note.slice(0, 400)}`);
  }
  const eventDiscussion = (eventNotes ?? []).filter((e: any) => e.notes?.trim());
  if (eventDiscussion.length) {
    summaryFacts.push(
      `Events discussed: ${eventDiscussion
        .map((e: any) => `${e.calendar_events?.title ?? "Event"} — ${(e.notes as string).slice(0, 200)}`)
        .join(" | ")}`,
    );
  }
  if (meeting.notes?.trim()) summaryFacts.push(`General notes: ${meeting.notes.slice(0, 500)}`);

  let aiSummary = "";
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  if (LOVABLE_API_KEY && summaryFacts.length) {
    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "You write concise executive summaries of church staff meetings for busy pastoral staff. Write 2-4 short sentences (under 90 words). Lead with the most important outcome. Be specific — reference decisions, key action items, or notable discussion themes by name. Warm but direct. No filler like 'The team met to...' or 'In this meeting...'.",
            },
            {
              role: "user",
              content: `Meeting date: ${meetingDate}.\n\nFacts:\n- ${summaryFacts.join("\n- ")}\n\nWrite the summary now.`,
            },
          ],
          max_tokens: 300,
        }),
      });
      if (resp.ok) {
        const j = await resp.json();
        aiSummary = (j?.choices?.[0]?.message?.content ?? "").trim();
      }
    } catch {
      /* fall through to no summary */
    }
  }

  // ---- HTML pieces ----
  const statChip = (label: string, value: string | number) =>
    `<td style="padding:0 8px;">
       <div style="background:#f5f5f4;border:1px solid #e7e5e4;border-radius:10px;padding:10px 14px;text-align:center;">
         <div style="font-size:22px;font-weight:700;color:#0c0a09;line-height:1.1;">${escapeHtml(String(value))}</div>
         <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#78716c;margin-top:2px;">${escapeHtml(label)}</div>
       </div>
     </td>`;

  const chips: string[] = [];
  if (agendaTotal) chips.push(statChip("Agenda", `${agendaDone}/${agendaTotal}`));
  if (decisionCount) chips.push(statChip("Decisions", decisionCount));
  if (actionCount) chips.push(statChip("Actions", actionCount));
  if (durationLabel) chips.push(statChip("Duration", durationLabel));

  const statsHtml = chips.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:4px 0 20px;border-collapse:separate;">
         <tr>${chips.join("")}</tr>
       </table>`
    : "";

  const summaryHtml = aiSummary
    ? `<div style="background:#fefce8;border-left:3px solid #ca8a04;padding:14px 18px;border-radius:8px;margin:0 0 20px;">
         <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#854d0e;margin-bottom:6px;">At a glance</div>
         <div style="color:#1c1917;">${escapeHtml(aiSummary)}</div>
       </div>`
    : "";

  const sectionHeading = (label: string) =>
    `<h3 style="margin:24px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:0.12em;color:#57534e;">${escapeHtml(label)}</h3>`;

  const sectionsHtml = Object.entries(SECTION_LABELS)
    .filter(([k]) => (sectionByKey.get(k) || "").toString().trim())
    .map(([k, label]) => `${sectionHeading(label)}<div style="white-space:pre-wrap;">${escapeHtml(sectionByKey.get(k) as string)}</div>`)
    .join("");

  const latestReviewDate = reviews?.[0]?.service_date;
  const sundayReview = latestReviewDate
    ? (reviews ?? []).filter((r: any) => r.service_date === latestReviewDate)
    : [];
  const sundayHtml = sundayReview.length
    ? `${sectionHeading(`Sunday — ${format(new Date(latestReviewDate + "T12:00"), "MMM d")}`)}
      <ul style="padding-left:18px;margin:6px 0;">
        ${sundayReview
          .flatMap((r: any) => [
            r.wins?.trim() ? `<li><strong>Win:</strong> ${escapeHtml(r.wins)}</li>` : "",
            r.opportunities?.trim() ? `<li><strong>Opportunity:</strong> ${escapeHtml(r.opportunities)}</li>` : "",
          ])
          .filter(Boolean)
          .join("")}
      </ul>`
    : "";

  const eventNotesHtml = eventDiscussion.length
    ? `${sectionHeading("Event Discussion")}
      <ul style="padding-left:18px;margin:6px 0;">
      ${eventDiscussion
        .map(
          (e: any) =>
            `<li><strong>${escapeHtml(e.calendar_events?.title ?? "Event")}</strong> (${escapeHtml(e.occurrence_date)}): ${escapeHtml(e.notes)}</li>`,
        )
        .join("")}
      </ul>`
    : "";

  const decisionsHtml = decisionCount
    ? `${sectionHeading("Decisions")}
      <ul style="padding-left:18px;margin:6px 0;">
        ${(decisions ?? [])
          .map((d: any) => {
            const outcomeColor =
              d.outcome === "passed" ? "#059669"
              : d.outcome === "failed" ? "#dc2626"
              : d.outcome === "tabled" ? "#d97706"
              : "#57534e";
            const votes =
              (d.vote_yes ?? 0) + (d.vote_no ?? 0) + (d.vote_abstain ?? 0) > 0
                ? ` <span style="color:#78716c;">(${d.vote_yes ?? 0}–${d.vote_no ?? 0}${d.vote_abstain ? `–${d.vote_abstain}a` : ""})</span>`
                : "";
            return `<li><strong>${escapeHtml(d.title)}</strong> — <span style="color:${outcomeColor};text-transform:uppercase;font-size:11px;letter-spacing:0.08em;">${escapeHtml(d.outcome)}</span>${votes}${
              d.motion_text ? `<div style="color:#57534e;margin-top:2px;">${escapeHtml(d.motion_text)}</div>` : ""
            }</li>`;
          })
          .join("")}
      </ul>`
    : "";

  const agendaHtml = (agenda ?? []).length
    ? `${sectionHeading("Items Discussed")}
      <ul style="padding-left:18px;margin:6px 0;">
        ${(agenda ?? [])
          .map(
            (a: any) =>
              `<li>${a.status === "done" ? "✓ " : a.status === "carried_over" ? "→ " : ""}${escapeHtml(a.title)}${
                a.notes ? ` — <em>${escapeHtml(a.notes)}</em>` : ""
              }</li>`,
          )
          .join("")}
      </ul>`
    : "";

  // Actions grouped by owner
  const actionsByOwner = new Map<string, any[]>();
  for (const a of actions ?? []) {
    const owner = a.assignee_id ? (profileById.get(a.assignee_id) as any) : null;
    const name = owner?.full_name || owner?.email || "Unassigned";
    if (!actionsByOwner.has(name)) actionsByOwner.set(name, []);
    actionsByOwner.get(name)!.push(a);
  }
  const today = format(new Date(), "yyyy-MM-dd");
  const actionHtml = actionCount
    ? `${sectionHeading(`New Action Items (${actionCount})`)}
      ${Array.from(actionsByOwner.entries())
        .map(
          ([owner, items]) => `
        <div style="margin:8px 0;">
          <div style="font-weight:600;color:#0c0a09;">${escapeHtml(owner)}</div>
          <ul style="padding-left:18px;margin:4px 0;">
            ${items
              .map((a: any) => {
                const overdue = a.due_date && a.due_date < today && !a.completed;
                const dueColor = overdue ? "#dc2626" : "#78716c";
                const due = a.due_date
                  ? ` <span style="color:${dueColor};font-size:12px;">· due ${format(new Date(a.due_date + "T12:00"), "MMM d")}${overdue ? " (overdue)" : ""}</span>`
                  : "";
                const done = a.completed ? "✓ " : "";
                return `<li>${done}${escapeHtml(a.title)}${due}</li>`;
              })
              .join("")}
          </ul>
        </div>`,
        )
        .join("")}`
    : "";

  const upcomingHtml = (upcoming ?? []).length
    ? `${sectionHeading("Coming up this week")}
      <ul style="padding-left:18px;margin:6px 0;">
        ${(upcoming ?? [])
          .slice(0, 10)
          .map(
            (e: any) =>
              `<li><strong>${escapeHtml(e.title)}</strong> — ${escapeHtml(format(new Date(e.start_at), "EEE MMM d, p"))}${
                e.leader_name ? ` · ${escapeHtml(e.leader_name)}` : ""
              }</li>`,
          )
          .join("")}
      </ul>`
    : "";

  const meetingNotesHtml = meeting.notes?.trim()
    ? `${sectionHeading("General Notes")}<div style="white-space:pre-wrap;">${escapeHtml(meeting.notes)}</div>`
    : "";

  const html = emailLayout(
    `Staff Meeting Recap — ${meetingDate}`,
    `<p style="margin:0 0 12px;color:#57534e;">Here's what happened at the staff meeting${durationLabel ? ` (${durationLabel})` : ""}.</p>
     ${statsHtml}
     ${summaryHtml}
     ${decisionsHtml}
     ${actionHtml}
     ${agendaHtml}
     ${sectionsHtml}
     ${sundayHtml}
     ${eventNotesHtml}
     ${meetingNotesHtml}
     ${upcomingHtml}`,
  );

  await sendEmail({
    to: recipients,
    subject: `Staff Meeting Recap — ${format(new Date(meeting.meeting_date + "T12:00"), "MMM d")}${
      decisionCount ? ` · ${decisionCount} decision${decisionCount === 1 ? "" : "s"}` : ""
    }${actionCount ? ` · ${actionCount} action${actionCount === 1 ? "" : "s"}` : ""}`,
    html,
  });

  await supabaseAdmin
    .from("meetings")
    .update({ recap_sent_at: new Date().toISOString() })
    .eq("id", meetingId);

  return { recipients: recipients.length };
}
