import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertCore(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "core")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: core role required");
}

// ------------- SECTIONS -------------

/**
 * Returns the ordered list of section names for a workflow. Auto-seeds any
 * section present in the workflow's tasks that isn't yet stored.
 */
export const listWorkflowSections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workflowId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: rows } = await supabaseAdmin
      .from("onboarding_workflow_sections")
      .select("section_name, sort_order")
      .eq("workflow_id", data.workflowId)
      .order("sort_order", { ascending: true });
    const existing = new Map<string, number>();
    (rows ?? []).forEach((r: any) => existing.set(r.section_name, r.sort_order));

    const { data: tasks } = await supabaseAdmin
      .from("onboarding_tasks")
      .select("section_name, sort_order, created_at")
      .eq("workflow_id", data.workflowId)
      .is("parent_task_id", null);

    // Collect sections that need to be seeded, preserving created_at order
    const seedOrder: { section: string; firstCreated: string; minSort: number }[] = [];
    const seen = new Set<string>(existing.keys());
    (tasks ?? [])
      .slice()
      .sort((a: any, b: any) => (a.created_at < b.created_at ? -1 : 1))
      .forEach((t: any) => {
        if (seen.has(t.section_name)) return;
        seen.add(t.section_name);
        seedOrder.push({
          section: t.section_name,
          firstCreated: t.created_at,
          minSort: t.sort_order ?? 0,
        });
      });

    if (seedOrder.length) {
      const base =
        Array.from(existing.values()).reduce((m, v) => (v > m ? v : m), 0) + 10;
      const inserts = seedOrder.map((s, i) => ({
        workflow_id: data.workflowId,
        section_name: s.section,
        sort_order: base + i * 10,
      }));
      await supabaseAdmin.from("onboarding_workflow_sections").insert(inserts);
      inserts.forEach((r) => existing.set(r.section_name, r.sort_order));
    }

    return Array.from(existing.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([section_name, sort_order]) => ({ section_name, sort_order }));
  });

export const reorderWorkflowSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        workflow_id: z.string().uuid(),
        section_name: z.string().min(1).max(200),
        direction: z.enum(["up", "down"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    const { data: current } = await supabaseAdmin
      .from("onboarding_workflow_sections")
      .select("section_name, sort_order")
      .eq("workflow_id", data.workflow_id)
      .eq("section_name", data.section_name)
      .maybeSingle();
    if (!current) throw new Error("Section not found");
    const cmp = data.direction === "up" ? "lt" : "gt";
    const asc = data.direction !== "up";
    const { data: sibling } = await supabaseAdmin
      .from("onboarding_workflow_sections")
      .select("section_name, sort_order")
      .eq("workflow_id", data.workflow_id)
      [cmp]("sort_order", current.sort_order)
      .order("sort_order", { ascending: asc })
      .limit(1);
    const swap = sibling?.[0];
    if (!swap) return { ok: true };
    await supabaseAdmin
      .from("onboarding_workflow_sections")
      .update({ sort_order: swap.sort_order })
      .eq("workflow_id", data.workflow_id)
      .eq("section_name", current.section_name);
    await supabaseAdmin
      .from("onboarding_workflow_sections")
      .update({ sort_order: current.sort_order })
      .eq("workflow_id", data.workflow_id)
      .eq("section_name", swap.section_name);
    return { ok: true };
  });

export const setWorkflowSectionOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        workflow_id: z.string().uuid(),
        section_names: z.array(z.string().min(1).max(200)).min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    // Ensure any missing sections exist, then set order = index * 10
    const updates = data.section_names.map((name, i) => ({
      workflow_id: data.workflow_id,
      section_name: name,
      sort_order: (i + 1) * 10,
    }));
    await supabaseAdmin
      .from("onboarding_workflow_sections")
      .upsert(updates, { onConflict: "workflow_id,section_name" });
    return { ok: true };
  });

export const renameWorkflowSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        workflow_id: z.string().uuid(),
        old_name: z.string().min(1).max(200),
        new_name: z.string().min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    if (data.old_name === data.new_name) return { ok: true };
    const { data: conflict } = await supabaseAdmin
      .from("onboarding_workflow_sections")
      .select("section_name")
      .eq("workflow_id", data.workflow_id)
      .eq("section_name", data.new_name)
      .maybeSingle();
    if (conflict) throw new Error("A section with that name already exists");
    await supabaseAdmin
      .from("onboarding_workflow_sections")
      .update({ section_name: data.new_name })
      .eq("workflow_id", data.workflow_id)
      .eq("section_name", data.old_name);
    await supabaseAdmin
      .from("onboarding_tasks")
      .update({ section_name: data.new_name })
      .eq("workflow_id", data.workflow_id)
      .eq("section_name", data.old_name);
    return { ok: true };
  });

// Documents feature was moved to a church-wide repository at /documents
// (see src/lib/documents.functions.ts). Per-workflow document uploads
// have been removed.

