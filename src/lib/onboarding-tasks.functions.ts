import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function deepLinkFor(workflowId: string) {
  const base =
    process.env.PUBLIC_APP_URL ??
    process.env.VITE_PUBLIC_APP_URL ??
    "https://coahfhstaffhub.lovable.app";
  return `${base.replace(/\/$/, "")}/onboarding/${workflowId}`;
}

async function composeTaskFields(onboardingTaskId: string) {
  const { data: task, error: tErr } = await supabaseAdmin
    .from("onboarding_tasks")
    .select(
      "id, task_name, section_name, description, workflow_id, action_item_id, is_completed, due_date",
    )
    .eq("id", onboardingTaskId)
    .maybeSingle();
  if (tErr || !task) throw new Error("Onboarding task not found");

  const { data: wf } = await supabaseAdmin
    .from("onboarding_workflows")
    .select("id, new_hire_name, hire_type, start_date")
    .eq("id", task.workflow_id)
    .maybeSingle();
  if (!wf) throw new Error("Workflow not found");

  const title = `Onboarding · ${wf.new_hire_name} — ${task.task_name}`;
  const notesLines = [
    `New hire: ${wf.new_hire_name}`,
    `Hire type: ${wf.hire_type}`,
    wf.start_date ? `Start date: ${wf.start_date}` : null,
    `Section: ${task.section_name}`,
    task.description ? `Details: ${task.description}` : null,
    "",
    `Open in CoaH: ${deepLinkFor(wf.id)}`,
  ].filter(Boolean) as string[];

  return { task, workflow: wf, title, notes: notesLines.join("\n") };
}

async function pushOrPatchGoogleTask(actionItemId: string) {
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

export const assignOnboardingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        onboardingTaskId: z.string().uuid(),
        assigneeId: z.string().uuid(),
        dueDate: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { title, notes, task, workflow } = await composeTaskFields(data.onboardingTaskId);

    if (task.action_item_id) {
      await supabaseAdmin
        .from("action_items")
        .update({
          title,
          notes,
          assignee_id: data.assigneeId,
          due_date: data.dueDate ?? null,
        })
        .eq("id", task.action_item_id);
      await supabaseAdmin
        .from("onboarding_tasks")
        .update({ assignee_id: data.assigneeId, due_date: data.dueDate ?? null })
        .eq("id", data.onboardingTaskId);
      await pushOrPatchGoogleTask(task.action_item_id);
      return { ok: true, actionItemId: task.action_item_id };
    }

    const { data: ai, error } = await supabaseAdmin
      .from("action_items")
      .insert({
        title,
        notes,
        assignee_id: data.assigneeId,
        due_date: data.dueDate ?? null,
        created_by: context.userId,
        source_onboarding_task_id: data.onboardingTaskId,
        source_workflow_id: workflow.id,
        completed: task.is_completed ?? false,
      })
      .select("id")
      .single();
    if (error || !ai) throw new Error(error?.message ?? "Failed to create task");

    await supabaseAdmin
      .from("onboarding_tasks")
      .update({
        assignee_id: data.assigneeId,
        due_date: data.dueDate ?? null,
        action_item_id: ai.id,
      })
      .eq("id", data.onboardingTaskId);

    await pushOrPatchGoogleTask(ai.id);
    return { ok: true, actionItemId: ai.id };
  });

export const unassignOnboardingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ onboardingTaskId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: task } = await supabaseAdmin
      .from("onboarding_tasks")
      .select("action_item_id")
      .eq("id", data.onboardingTaskId)
      .maybeSingle();

    await supabaseAdmin
      .from("onboarding_tasks")
      .update({ assignee_id: null, due_date: null, action_item_id: null })
      .eq("id", data.onboardingTaskId);

    if (task?.action_item_id) {
      const { data: ai } = await supabaseAdmin
        .from("action_items")
        .select("assignee_id, google_task_id")
        .eq("id", task.action_item_id)
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
      await supabaseAdmin.from("action_items").delete().eq("id", task.action_item_id);
    }
    return { ok: true };
  });

export const listAssignableUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .order("full_name");
    return (data ?? []) as { id: string; full_name: string | null; email: string | null }[];
  });
