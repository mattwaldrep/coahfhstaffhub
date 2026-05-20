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

// ---------- TEMPLATES ----------

export const listTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("onboarding_templates")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertTemplateNode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        parent_id: z.string().uuid().nullable().optional(),
        section_name: z.string().min(1).max(200),
        task_name: z.string().min(1).max(500),
        description: z.string().max(4000).nullable().optional(),
        is_onsite_only: z.boolean().optional(),
        sort_order: z.number().int().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("onboarding_templates")
        .update({
          parent_id: data.parent_id ?? null,
          section_name: data.section_name,
          task_name: data.task_name,
          description: data.description ?? null,
          is_onsite_only: data.is_onsite_only ?? false,
          ...(data.sort_order !== undefined ? { sort_order: data.sort_order } : {}),
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    // Compute sort_order at end of siblings if not provided
    let sort = data.sort_order;
    if (sort === undefined) {
      const { data: siblings } = await supabaseAdmin
        .from("onboarding_templates")
        .select("sort_order")
        .eq("section_name", data.section_name)
        .is("parent_id", data.parent_id ?? null)
        .order("sort_order", { ascending: false })
        .limit(1);
      sort = ((siblings?.[0]?.sort_order as number | undefined) ?? 0) + 10;
    }
    const { data: ins, error } = await supabaseAdmin
      .from("onboarding_templates")
      .insert({
        parent_id: data.parent_id ?? null,
        section_name: data.section_name,
        task_name: data.task_name,
        description: data.description ?? null,
        is_onsite_only: data.is_onsite_only ?? false,
        sort_order: sort,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: ins!.id };
  });

export const setTemplateActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("onboarding_templates")
      .update({ is_active: data.is_active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderTemplateNode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), direction: z.enum(["up", "down"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    const { data: node } = await supabaseAdmin
      .from("onboarding_templates")
      .select("id, parent_id, section_name, sort_order")
      .eq("id", data.id)
      .single();
    if (!node) throw new Error("Not found");
    const cmp = data.direction === "up" ? "lt" : "gt";
    const order: "asc" | "desc" = data.direction === "up" ? "desc" : "asc";
    let query = supabaseAdmin
      .from("onboarding_templates")
      .select("id, sort_order")
      .eq("section_name", node.section_name)
      [cmp]("sort_order", node.sort_order)
      .order("sort_order", { ascending: order === "asc" })
      .limit(1);
    query = node.parent_id
      ? query.eq("parent_id", node.parent_id)
      : query.is("parent_id", null);
    const { data: sibling } = await query;
    const swap = sibling?.[0];
    if (!swap) return { ok: true };
    await supabaseAdmin
      .from("onboarding_templates")
      .update({ sort_order: swap.sort_order })
      .eq("id", node.id);
    await supabaseAdmin
      .from("onboarding_templates")
      .update({ sort_order: node.sort_order })
      .eq("id", swap.id);
    return { ok: true };
  });

// ---------- WORKFLOWS ----------

export const listWorkflows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data: workflows, error } = await supabaseAdmin
      .from("onboarding_workflows")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (workflows ?? []).map((w: any) => w.id);
    let counts = new Map<string, { total: number; done: number; skipped: number }>();
    if (ids.length) {
      const { data: tasks } = await supabaseAdmin
        .from("onboarding_tasks")
        .select("workflow_id, is_completed, is_skipped, parent_task_id, id");
      // Only count leaf tasks
      const childrenOf = new Map<string, number>();
      (tasks ?? []).forEach((t: any) => {
        if (t.parent_task_id) {
          childrenOf.set(t.parent_task_id, (childrenOf.get(t.parent_task_id) ?? 0) + 1);
        }
      });
      (tasks ?? []).forEach((t: any) => {
        if (childrenOf.has(t.id)) return; // not a leaf
        const c = counts.get(t.workflow_id) ?? { total: 0, done: 0, skipped: 0 };
        if (t.is_skipped) c.skipped += 1;
        else {
          c.total += 1;
          if (t.is_completed) c.done += 1;
        }
        counts.set(t.workflow_id, c);
      });
    }
    return (workflows ?? []).map((w: any) => ({
      ...w,
      progress: counts.get(w.id) ?? { total: 0, done: 0, skipped: 0 },
    }));
  });

export const getWorkflow = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: workflow, error } = await supabaseAdmin
      .from("onboarding_workflows")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!workflow) throw new Error("Workflow not found");
    const { data: tasks } = await supabaseAdmin
      .from("onboarding_tasks")
      .select("*")
      .eq("workflow_id", data.id)
      .order("sort_order", { ascending: true });
    return { workflow, tasks: tasks ?? [] };
  });

export const launchWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        new_hire_name: z.string().min(1).max(200),
        new_hire_email: z.string().email().optional().or(z.literal("")).optional(),
        hire_type: z.enum(["onsite", "remote", "hybrid"]),
        start_date: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);

    const { data: wf, error: wfErr } = await supabaseAdmin
      .from("onboarding_workflows")
      .insert({
        new_hire_name: data.new_hire_name,
        new_hire_email: data.new_hire_email || null,
        hire_type: data.hire_type,
        start_date: data.start_date || null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (wfErr || !wf) throw new Error(wfErr?.message ?? "Failed to create workflow");

    const { data: templates, error: tErr } = await supabaseAdmin
      .from("onboarding_templates")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (tErr) throw new Error(tErr.message);

    // Build template id -> new task id map; clone in topological order (parents first).
    const remaining = [...(templates ?? [])];
    const idMap = new Map<string, string>();
    const processed = new Set<string>();
    const isRemote = data.hire_type === "remote";

    // Determine which templates inherit on-site (via ancestor chain)
    const byId = new Map<string, any>();
    (templates ?? []).forEach((t: any) => byId.set(t.id, t));
    const onsiteCache = new Map<string, boolean>();
    function isOnsite(id: string): boolean {
      if (onsiteCache.has(id)) return onsiteCache.get(id)!;
      const t = byId.get(id);
      if (!t) return false;
      const res = !!t.is_onsite_only || (t.parent_id ? isOnsite(t.parent_id) : false);
      onsiteCache.set(id, res);
      return res;
    }

    let guard = 0;
    while (remaining.length && guard++ < 10000) {
      const next = remaining.findIndex((t) => !t.parent_id || idMap.has(t.parent_id));
      if (next === -1) break;
      const tpl = remaining.splice(next, 1)[0];
      const skip = isRemote && isOnsite(tpl.id);
      const { data: ins, error } = await supabaseAdmin
        .from("onboarding_tasks")
        .insert({
          workflow_id: wf.id,
          parent_task_id: tpl.parent_id ? idMap.get(tpl.parent_id) ?? null : null,
          source_template_id: tpl.id,
          section_name: tpl.section_name,
          task_name: tpl.task_name,
          description: tpl.description,
          is_skipped: skip,
          skipped_reason: skip ? "Remote hire — on-site only task" : null,
          sort_order: tpl.sort_order,
        })
        .select("id")
        .single();
      if (error || !ins) throw new Error(error?.message ?? "Failed to clone task");
      idMap.set(tpl.id, ins.id);
      processed.add(tpl.id);
    }

    return { ok: true, id: wf.id };
  });

export const setTaskCompleted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ task_id: z.string().uuid(), completed: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("onboarding_tasks")
      .update({
        is_completed: data.completed,
        completed_at: data.completed ? new Date().toISOString() : null,
        completed_by: data.completed ? context.userId : null,
      })
      .eq("id", data.task_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setTaskSkipped = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        task_id: z.string().uuid(),
        skipped: z.boolean(),
        reason: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("onboarding_tasks")
      .update({
        is_skipped: data.skipped,
        skipped_reason: data.skipped ? data.reason ?? "Skipped" : null,
      })
      .eq("id", data.task_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addAdHocTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        workflow_id: z.string().uuid(),
        parent_task_id: z.string().uuid().nullable().optional(),
        section_name: z.string().min(1).max(200),
        task_name: z.string().min(1).max(500),
        description: z.string().max(4000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    const { data: sib } = await supabaseAdmin
      .from("onboarding_tasks")
      .select("sort_order")
      .eq("workflow_id", data.workflow_id)
      .eq("section_name", data.section_name)
      .is("parent_task_id", data.parent_task_id ?? null)
      .order("sort_order", { ascending: false })
      .limit(1);
    const sort = ((sib?.[0]?.sort_order as number | undefined) ?? 0) + 10;
    const { error } = await supabaseAdmin.from("onboarding_tasks").insert({
      workflow_id: data.workflow_id,
      parent_task_id: data.parent_task_id ?? null,
      section_name: data.section_name,
      task_name: data.task_name,
      description: data.description ?? null,
      sort_order: sort,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setWorkflowStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["active", "paused", "completed", "archived"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("onboarding_workflows")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ task_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("onboarding_tasks")
      .delete()
      .eq("id", data.task_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
