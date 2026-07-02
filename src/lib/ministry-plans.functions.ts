import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const MINISTRY_AREAS = [
  "Worship",
  "AV",
  "Prayer",
  "Hospitality",
  "Set Up",
  "Creative",
  "Men's",
  "Women's",
  "Kids",
  "Youth",
  "Connect",
  "Other",
] as const;
export type MinistryArea = (typeof MINISTRY_AREAS)[number];

export type PlanStatus = "draft" | "submitted" | "under_review" | "approved";

export type ProgramEntry = { id: string; name: string; cadence: string; description: string };
export type GoalEntry = {
  id: string;
  goal_statement: string;
  completion_date: string | null;
  significant_others: string;
  execution_steps: { id: string; text: string }[];
};

export type MinistryPlan = {
  id: string;
  user_id: string;
  leader_name: string;
  campus: string;
  department: string;
  ministry_area: MinistryArea | null;
  calendar_year: number;
  purpose: string;
  programs: ProgramEntry[];
  org_structure: string;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
  goals: GoalEntry[];
  status: PlanStatus;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

async function isCore(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "core")
    .maybeSingle();
  return !!data;
}

function normalize(row: any): MinistryPlan {
  return {
    ...row,
    programs: Array.isArray(row.programs) ? row.programs : [],
    strengths: Array.isArray(row.strengths) ? row.strengths : [],
    weaknesses: Array.isArray(row.weaknesses) ? row.weaknesses : [],
    opportunities: Array.isArray(row.opportunities) ? row.opportunities : [],
    threats: Array.isArray(row.threats) ? row.threats : [],
    goals: Array.isArray(row.goals) ? row.goals : [],
  };
}

export const listMyPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("ministry_action_plans")
      .select("*")
      .eq("user_id", context.userId)
      .order("calendar_year", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(normalize);
  });

export const listAllPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isCore(context.userId))) throw new Error("Forbidden");
    const { data, error } = await supabaseAdmin
      .from("ministry_action_plans")
      .select("*")
      .order("calendar_year", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) throw error;
    const plans = (data ?? []).map(normalize);
    const userIds = Array.from(new Set(plans.map((p) => p.user_id)));
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const nameMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name || p.email]));
    return plans.map((p) => ({ ...p, author_name: nameMap.get(p.user_id) ?? null }));
  });

export const getPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ planId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await supabaseAdmin
      .from("ministry_action_plans")
      .select("*")
      .eq("id", data.planId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Not found");
    if (row.user_id !== context.userId && !(await isCore(context.userId))) {
      throw new Error("Forbidden");
    }
    const plan = normalize(row);
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", plan.user_id)
      .maybeSingle();
    return { ...plan, author_name: prof?.full_name || prof?.email || null };
  });

export const createPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        leader_name: z.string().default(""),
        ministry_area: z.enum(MINISTRY_AREAS),
        calendar_year: z.number().int().min(2000).max(3000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // uniqueness check
    const { data: existing } = await supabaseAdmin
      .from("ministry_action_plans")
      .select("id")
      .eq("user_id", context.userId)
      .eq("ministry_area", data.ministry_area)
      .eq("calendar_year", data.calendar_year)
      .maybeSingle();
    if (existing) return { id: existing.id, existed: true };

    const { data: row, error } = await supabaseAdmin
      .from("ministry_action_plans")
      .insert({
        user_id: context.userId,
        leader_name: data.leader_name,
        ministry_area: data.ministry_area,
        calendar_year: data.calendar_year,
      })
      .select("id")
      .single();
    if (error) throw error;

    // Hydrate from most recent un-carried 10k-ft plan for this leader + ministry
    try {
      const { data: hlp } = await supabaseAdmin
        .from("ministry_high_level_plans")
        .select("*")
        .eq("user_id", context.userId)
        .eq("ministry_area", data.ministry_area)
        .is("carried_to_map_id", null)
        .order("fiscal_year", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (hlp) {
        const swot = (hlp.swot_seeds ?? {}) as any;
        const patch: Record<string, unknown> = {};
        if (hlp.purpose) patch.purpose = hlp.purpose;
        if (Array.isArray(hlp.top_goals) && hlp.top_goals.length) {
          patch.goals = (hlp.top_goals as any[]).map((g) => ({
            id: crypto.randomUUID(),
            goal_statement: g.statement ?? "",
            completion_date: null,
            significant_others: g.why ?? "",
            execution_steps: [],
          }));
        }
        if (Array.isArray(swot.strengths) && swot.strengths.length) patch.strengths = swot.strengths;
        if (Array.isArray(swot.weaknesses) && swot.weaknesses.length) patch.weaknesses = swot.weaknesses;
        if (Array.isArray(swot.opportunities) && swot.opportunities.length) patch.opportunities = swot.opportunities;
        if (Array.isArray(swot.threats) && swot.threats.length) patch.threats = swot.threats;
        if (Object.keys(patch).length > 0) {
          await supabaseAdmin.from("ministry_action_plans").update(patch as any).eq("id", row.id);
        }
        await supabaseAdmin
          .from("ministry_high_level_plans")
          .update({ carried_to_map_id: row.id })
          .eq("id", hlp.id);
      }
    } catch (e) {
      console.error("MAP hydrate from HLP failed:", e);
    }
    return { id: row.id, existed: false };
  });

const patchSchema = z
  .object({
    leader_name: z.string().optional(),
    campus: z.string().optional(),
    department: z.string().optional(),
    ministry_area: z.enum(MINISTRY_AREAS).optional(),
    calendar_year: z.number().int().optional(),
    purpose: z.string().optional(),
    programs: z.array(z.any()).optional(),
    org_structure: z.string().optional(),
    strengths: z.array(z.string()).optional(),
    weaknesses: z.array(z.string()).optional(),
    opportunities: z.array(z.string()).optional(),
    threats: z.array(z.string()).optional(),
    goals: z.array(z.any()).optional(),
  })
  .strict();

export const updateMinistryPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ planId: z.string().uuid(), patch: patchSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await supabaseAdmin
      .from("ministry_action_plans")
      .select("user_id, status")
      .eq("id", data.planId)
      .maybeSingle();
    if (!row) throw new Error("Not found");
    if (row.user_id !== context.userId) throw new Error("Forbidden");
    if (row.status !== "draft") throw new Error("Plan is no longer editable");

    const { error } = await supabaseAdmin
      .from("ministry_action_plans")
      .update(data.patch)
      .eq("id", data.planId);
    if (error) throw error;
    return { ok: true };
  });

export const submitPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ planId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await supabaseAdmin
      .from("ministry_action_plans")
      .select("user_id, status")
      .eq("id", data.planId)
      .maybeSingle();
    if (!row) throw new Error("Not found");
    if (row.user_id !== context.userId) throw new Error("Forbidden");
    if (row.status !== "draft") throw new Error("Already submitted");
    const { error } = await supabaseAdmin
      .from("ministry_action_plans")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", data.planId);
    if (error) throw error;
    return { ok: true };
  });

export const setPlanStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        planId: z.string().uuid(),
        status: z.enum(["draft", "submitted", "under_review", "approved"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isCore(context.userId))) throw new Error("Forbidden");
    const patch: any = { status: data.status };
    if (data.status === "under_review" || data.status === "approved") {
      patch.reviewed_by = context.userId;
      patch.reviewed_at = new Date().toISOString();
    }
    const { error } = await supabaseAdmin
      .from("ministry_action_plans")
      .update(patch)
      .eq("id", data.planId);
    if (error) throw error;
    return { ok: true };
  });

export const deletePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ planId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await supabaseAdmin
      .from("ministry_action_plans")
      .select("user_id, status")
      .eq("id", data.planId)
      .maybeSingle();
    if (!row) throw new Error("Not found");
    if (row.user_id !== context.userId) throw new Error("Forbidden");
    if (row.status !== "draft") throw new Error("Only drafts can be deleted");
    const { error } = await supabaseAdmin
      .from("ministry_action_plans")
      .delete()
      .eq("id", data.planId);
    if (error) throw error;
    return { ok: true };
  });
