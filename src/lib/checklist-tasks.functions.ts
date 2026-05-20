import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function deepLinkFor(eventId: string) {
  const base =
    process.env.PUBLIC_APP_URL ??
    process.env.VITE_PUBLIC_APP_URL ??
    "https://coahfhstaffhub.lovable.app";
  return `${base.replace(/\/$/, "")}/calendar?event=${eventId}`;
}

async function composeTaskFields(checklistItemId: string, overrideOccurrence?: string | null) {
  const { data: item, error: itemErr } = await supabaseAdmin
    .from("event_checklist_items")
    .select("id, label, event_id, due_date, action_item_id, done")
    .eq("id", checklistItemId)
    .maybeSingle();
  if (itemErr || !item) throw new Error("Checklist item not found");

  const { data: ev } = await supabaseAdmin
    .from("calendar_events")
    .select("id, title, start_at, location, category")
    .eq("id", item.event_id)
    .maybeSingle();
  if (!ev) throw new Error("Event not found");

  const occ = overrideOccurrence ?? ev.start_at;
  const occDate = occ ? new Date(occ) : null;
  const dateLabel = occDate ? formatDate(occDate) : "";
  const title = dateLabel
    ? `${ev.title} (${dateLabel}) — ${item.label}`
    : `${ev.title} — ${item.label}`;

  const notesLines = [
    `Event: ${ev.title}`,
    occDate ? `When: ${occDate.toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })}` : null,
    ev.location ? `Where: ${ev.location}` : null,
    ev.category ? `Category: ${ev.category}` : null,
    "",
    `Open in CoaH: ${deepLinkFor(ev.id)}`,
  ].filter(Boolean) as string[];

  return { item, event: ev, title, notes: notesLines.join("\n") };
}

async function pushOrPatchGoogleTask(actionItemId: string) {
  // Reuse existing single-item auto-push if not yet pushed.
  const { data: ai } = await supabaseAdmin
    .from("action_items")
    .select("id, title, notes, due_date, assignee_id, google_task_id")
    .eq("id", actionItemId)
    .maybeSingle();
  if (!ai || !ai.assignee_id) return;

  const { data: integ } = await supabaseAdmin
    .from("user_integrations")
    .select("auto_push")
    .eq("user_id", ai.assignee_id)
    .eq("provider", "google_tasks")
    .maybeSingle();
  if (!integ?.auto_push) return;

  const { ensureAccessTokenForUser } = await import("@/server/google-tasks.server");
  let accessToken: string;
  try {
    accessToken = await ensureAccessTokenForUser(ai.assignee_id);
  } catch {
    return;
  }

  const body: Record<string, any> = { title: ai.title };
  if (ai.notes) body.notes = ai.notes;
  if (ai.due_date) body.due = `${ai.due_date}T00:00:00.000Z`;

  if (ai.google_task_id) {
    // Patch existing task.
    await fetch(
      `https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${ai.google_task_id}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  } else {
    const res = await fetch("https://tasks.googleapis.com/tasks/v1/lists/@default/tasks", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const result = await res.json();
      await supabaseAdmin
        .from("action_items")
        .update({
          google_task_id: result.id,
          google_task_pushed_at: new Date().toISOString(),
          google_task_pushed_by: ai.assignee_id,
        })
        .eq("id", ai.id);
    }
  }
}

export const assignChecklistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        checklistItemId: z.string().uuid(),
        assigneeId: z.string().uuid(),
        dueDate: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { title, notes, item, event } = await composeTaskFields(data.checklistItemId);

    // If already assigned, update instead of creating a duplicate.
    if (item.action_item_id) {
      await supabaseAdmin
        .from("action_items")
        .update({
          title,
          notes,
          assignee_id: data.assigneeId,
          due_date: data.dueDate ?? null,
        })
        .eq("id", item.action_item_id);
      await supabaseAdmin
        .from("event_checklist_items")
        .update({ assignee_id: data.assigneeId, due_date: data.dueDate ?? null })
        .eq("id", data.checklistItemId);
      await pushOrPatchGoogleTask(item.action_item_id);
      return { ok: true, actionItemId: item.action_item_id };
    }

    const { data: ai, error } = await supabaseAdmin
      .from("action_items")
      .insert({
        title,
        notes,
        assignee_id: data.assigneeId,
        due_date: data.dueDate ?? null,
        created_by: context.userId,
        source_event_id: event.id,
        source_checklist_item_id: data.checklistItemId,
        completed: item.done ?? false,
      })
      .select("id")
      .single();
    if (error || !ai) throw new Error(error?.message ?? "Failed to create task");

    await supabaseAdmin
      .from("event_checklist_items")
      .update({
        assignee_id: data.assigneeId,
        due_date: data.dueDate ?? null,
        action_item_id: ai.id,
      })
      .eq("id", data.checklistItemId);

    await pushOrPatchGoogleTask(ai.id);
    return { ok: true, actionItemId: ai.id };
  });

export const unassignChecklistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ checklistItemId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: item } = await supabaseAdmin
      .from("event_checklist_items")
      .select("action_item_id")
      .eq("id", data.checklistItemId)
      .maybeSingle();

    await supabaseAdmin
      .from("event_checklist_items")
      .update({ assignee_id: null, due_date: null, action_item_id: null })
      .eq("id", data.checklistItemId);

    if (item?.action_item_id) {
      // Mark linked Google Task complete if pushed (Google API for cross-user delete is unreliable).
      const { data: ai } = await supabaseAdmin
        .from("action_items")
        .select("assignee_id, google_task_id")
        .eq("id", item.action_item_id)
        .maybeSingle();
      if (ai?.google_task_id && ai.assignee_id) {
        try {
          const { ensureAccessTokenForUser } = await import("@/server/google-tasks.server");
          const accessToken = await ensureAccessTokenForUser(ai.assignee_id);
          await fetch(
            `https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${ai.google_task_id}`,
            {
              method: "PATCH",
              headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({ status: "completed" }),
            },
          );
        } catch {
          // best-effort
        }
      }
      await supabaseAdmin.from("action_items").delete().eq("id", item.action_item_id);
    }
    return { ok: true };
  });

export const relabelChecklistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ checklistItemId: z.string().uuid(), label: z.string().min(1).max(500) }).parse(d),
  )
  .handler(async ({ data }) => {
    await supabaseAdmin
      .from("event_checklist_items")
      .update({ label: data.label })
      .eq("id", data.checklistItemId);
    const { title, notes, item } = await composeTaskFields(data.checklistItemId);
    if (item.action_item_id) {
      await supabaseAdmin
        .from("action_items")
        .update({ title, notes })
        .eq("id", item.action_item_id);
      await pushOrPatchGoogleTask(item.action_item_id);
    }
    return { ok: true };
  });
