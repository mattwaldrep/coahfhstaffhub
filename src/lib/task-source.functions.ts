import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type TaskSource = {
  kind:
    | "event_checklist"
    | "calendar_event"
    | "sunday_ops_issue"
    | "onboarding_task"
    | "onboarding_workflow"
    | "meeting"
    | "manual"
    | "unknown";
  label: string;
  detail?: string | null;
  href?: string | null;
  hrefSearch?: Record<string, string> | null;
  createdAt: string;
  createdByName?: string | null;
};

export const getTaskSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ actionItemId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<TaskSource> => {
    const { data: item, error } = await supabaseAdmin
      .from("action_items")
      .select(
        "id,title,created_at,created_by,meeting_id,source_checklist_item_id,source_event_id,source_issue_external_id,source_onboarding_task_id,source_workflow_id",
      )
      .eq("id", data.actionItemId)
      .maybeSingle();
    if (error || !item) throw new Error("Task not found");

    let createdByName: string | null = null;
    if (item.created_by) {
      const { data: p } = await supabaseAdmin
        .from("profiles")
        .select("full_name,email")
        .eq("id", item.created_by)
        .maybeSingle();
      createdByName = p?.full_name || p?.email || null;
    }

    const base = { createdAt: item.created_at, createdByName };

    // 1. Event checklist item
    if (item.source_checklist_item_id) {
      const { data: cli } = await supabaseAdmin
        .from("event_checklist_items")
        .select("label,event_id")
        .eq("id", item.source_checklist_item_id)
        .maybeSingle();
      let eventTitle: string | null = null;
      if (cli?.event_id) {
        const { data: ev } = await supabaseAdmin
          .from("calendar_events")
          .select("title")
          .eq("id", cli.event_id)
          .maybeSingle();
        eventTitle = ev?.title ?? null;
      }
      return {
        ...base,
        kind: "event_checklist",
        label: "Event checklist",
        detail: eventTitle ? `${eventTitle} — ${cli?.label ?? ""}`.trim() : cli?.label ?? null,
        href: cli?.event_id ? "/calendar" : null,
        hrefSearch: cli?.event_id ? { event: cli.event_id } : null,
      };
    }

    // 2. Direct calendar event link
    if (item.source_event_id) {
      const { data: ev } = await supabaseAdmin
        .from("calendar_events")
        .select("title")
        .eq("id", item.source_event_id)
        .maybeSingle();
      return {
        ...base,
        kind: "calendar_event",
        label: "Calendar event",
        detail: ev?.title ?? null,
        href: "/calendar",
        hrefSearch: { event: item.source_event_id },
      };
    }

    // 3. Sunday Ops issue
    if (item.source_issue_external_id) {
      const id = item.source_issue_external_id;
      const detail = id.startsWith("sunday-ops-issue:")
        ? `Issue ID ${id.slice("sunday-ops-issue:".length)}`
        : id;
      return {
        ...base,
        kind: "sunday_ops_issue",
        label: "Sunday Ops problem report",
        detail,
        href: "/meeting",
        hrefSearch: null,
      };
    }

    // 4. Onboarding task
    if (item.source_onboarding_task_id) {
      const { data: ot } = await supabaseAdmin
        .from("onboarding_tasks")
        .select("title,workflow_id")
        .eq("id", item.source_onboarding_task_id)
        .maybeSingle();
      let workflowName: string | null = null;
      if (ot?.workflow_id) {
        const { data: wf } = await supabaseAdmin
          .from("onboarding_workflows")
          .select("name")
          .eq("id", ot.workflow_id)
          .maybeSingle();
        workflowName = wf?.name ?? null;
      }
      return {
        ...base,
        kind: "onboarding_task",
        label: "Onboarding workflow",
        detail: workflowName
          ? `${workflowName} — ${ot?.title ?? ""}`.trim()
          : ot?.title ?? null,
        href: ot?.workflow_id ? `/onboarding/${ot.workflow_id}` : null,
      };
    }

    if (item.source_workflow_id) {
      const { data: wf } = await supabaseAdmin
        .from("onboarding_workflows")
        .select("name")
        .eq("id", item.source_workflow_id)
        .maybeSingle();
      return {
        ...base,
        kind: "onboarding_workflow",
        label: "Onboarding workflow",
        detail: wf?.name ?? null,
        href: `/onboarding/${item.source_workflow_id}`,
      };
    }

    // 5. Staff meeting
    if (item.meeting_id) {
      const { data: m } = await supabaseAdmin
        .from("meetings")
        .select("title,meeting_date")
        .eq("id", item.meeting_id)
        .maybeSingle();
      const detail = m
        ? [m.title, m.meeting_date].filter(Boolean).join(" — ")
        : null;
      return {
        ...base,
        kind: "meeting",
        label: "Staff meeting",
        detail,
        href: "/meeting",
      };
    }

    // 6. Manual
    return {
      ...base,
      kind: "manual",
      label: "Added manually",
      detail: createdByName ? `by ${createdByName}` : null,
    };
  });
