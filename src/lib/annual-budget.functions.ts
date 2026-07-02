import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MINISTRY_AREAS, type MinistryArea } from "@/lib/ministry-plans.functions";
import { fiscalYearOf, currentFiscalYear } from "@/lib/fiscal-year";

export type CycleStatus =
  | "setup"
  | "rough_planning"
  | "sheet_submission"
  | "feedback"
  | "complete";

export type RoughStatus = "not_started" | "in_progress" | "submitted";
export type SheetStatus =
  | "awaiting_link"
  | "in_progress"
  | "submitted"
  | "feedback_provided"
  | "revised";

export type BudgetCycle = {
  id: string;
  fiscal_year: number;
  status: CycleStatus;
  rough_due_date: string | null;
  sheet_link_target_date: string | null;
  opened_at: string | null;
  closed_at: string | null;
};

export type BudgetSubmission = {
  id: string;
  cycle_id: string;
  user_id: string;
  ministry_area: string;
  spending_report_uploaded_at: string | null;
  spending_report_path: string | null;
  rough_status: RoughStatus;
  rough_submitted_at: string | null;
  sheet_url: string | null;
  sheet_status: SheetStatus;
  sheet_submitted_at: string | null;
  feedback_body: string | null;
  feedback_submitted_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  author_name?: string | null;
  author_email?: string | null;
  fiscal_year?: number;
};

export type RoughLine = {
  id: string;
  submission_id: string;
  category_id: string | null;
  category_name: string;
  amount_annual: number;
  note: string | null;
  sort_order: number;
};

export type HighLevelPlan = {
  id: string;
  submission_id: string;
  user_id: string;
  ministry_area: string;
  fiscal_year: number;
  purpose: string;
  top_goals: { id: string; statement: string; why: string }[];
  swot_seeds: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  notes: string;
  carried_to_map_id: string | null;
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

// ---------- Cycles ----------

export const getCurrentCycle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const fy = currentFiscalYear();
    // Return the cycle for THIS fiscal year (created on/around March 1)
    const { data } = await supabaseAdmin
      .from("budget_cycles")
      .select("*")
      .eq("fiscal_year", fy)
      .maybeSingle();
    return (data as BudgetCycle) ?? null;
  });

export const listCycles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("budget_cycles")
      .select("*")
      .order("fiscal_year", { ascending: false });
    if (error) throw error;
    return (data ?? []) as BudgetCycle[];
  });

export const openOrGetCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ fiscalYear: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isCore(context.userId))) throw new Error("Forbidden");
    const { data: existing } = await supabaseAdmin
      .from("budget_cycles")
      .select("*")
      .eq("fiscal_year", data.fiscalYear)
      .maybeSingle();
    if (existing) return existing as BudgetCycle;

    const fy = data.fiscalYear;
    // Rough phase due: March 31 of the year the FY starts (fy - 1)
    const roughDue = `${fy - 1}-03-31`;
    const sheetTarget = `${fy - 1}-04-01`;

    const { data: row, error } = await supabaseAdmin
      .from("budget_cycles")
      .insert({
        fiscal_year: fy,
        status: "rough_planning",
        rough_due_date: roughDue,
        sheet_link_target_date: sheetTarget,
        opened_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) throw error;

    // Auto-create submissions for every active leader assignment
    const { data: assignments } = await supabaseAdmin
      .from("ministry_leader_assignments")
      .select("user_id, ministry_area")
      .eq("active", true);

    if ((assignments ?? []).length > 0) {
      await supabaseAdmin.from("ministry_budget_submissions").insert(
        (assignments ?? []).map((a: any) => ({
          cycle_id: row.id,
          user_id: a.user_id,
          ministry_area: a.ministry_area,
        })),
      );
    }
    return row as BudgetCycle;
  });

export const advanceCycleStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        cycleId: z.string().uuid(),
        status: z.enum(["setup", "rough_planning", "sheet_submission", "feedback", "complete"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isCore(context.userId))) throw new Error("Forbidden");
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "complete") patch.closed_at = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("budget_cycles")
      .update(patch)
      .eq("id", data.cycleId);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Leader assignments ----------

export const listLeaderAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isCore(context.userId))) throw new Error("Forbidden");
    const { data, error } = await supabaseAdmin
      .from("ministry_leader_assignments")
      .select("id, user_id, ministry_area, active");
    if (error) throw error;
    const userIds = Array.from(new Set((data ?? []).map((r: any) => r.user_id)));
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const nameMap = new Map(
      (profs ?? []).map((p: any) => [p.id, { name: p.full_name || p.email, email: p.email }]),
    );
    return (data ?? []).map((r: any) => ({
      ...r,
      full_name: nameMap.get(r.user_id)?.name ?? null,
      email: nameMap.get(r.user_id)?.email ?? null,
    }));
  });

export const upsertLeaderAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        userId: z.string().uuid(),
        ministryArea: z.enum(MINISTRY_AREAS),
        active: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isCore(context.userId))) throw new Error("Forbidden");
    const { error } = await supabaseAdmin
      .from("ministry_leader_assignments")
      .upsert(
        {
          user_id: data.userId,
          ministry_area: data.ministryArea,
          active: data.active,
        },
        { onConflict: "user_id,ministry_area" },
      );
    if (error) throw error;
    return { ok: true };
  });

export const deleteLeaderAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ assignmentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isCore(context.userId))) throw new Error("Forbidden");
    const { error } = await supabaseAdmin
      .from("ministry_leader_assignments")
      .delete()
      .eq("id", data.assignmentId);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Submissions ----------

export const listSubmissionsForCycle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ cycleId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isCore(context.userId))) throw new Error("Forbidden");
    const { data: rows, error } = await supabaseAdmin
      .from("ministry_budget_submissions")
      .select("*")
      .eq("cycle_id", data.cycleId)
      .order("ministry_area", { ascending: true });
    if (error) throw error;

    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const nameMap = new Map(
      (profs ?? []).map((p: any) => [p.id, { name: p.full_name || p.email, email: p.email }]),
    );
    return (rows ?? []).map((r: any) => ({
      ...r,
      author_name: nameMap.get(r.user_id)?.name ?? null,
      author_email: nameMap.get(r.user_id)?.email ?? null,
    })) as BudgetSubmission[];
  });

export const listMySubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("ministry_budget_submissions")
      .select("*, budget_cycles!inner(fiscal_year, status)")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      ...r,
      fiscal_year: r.budget_cycles?.fiscal_year,
    })) as BudgetSubmission[];
  });

export const getSubmission = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ submissionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await supabaseAdmin
      .from("ministry_budget_submissions")
      .select("*, budget_cycles!inner(fiscal_year, status, rough_due_date, sheet_link_target_date)")
      .eq("id", data.submissionId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Not found");
    if (row.user_id !== context.userId && !(await isCore(context.userId))) {
      throw new Error("Forbidden");
    }
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", row.user_id)
      .maybeSingle();
    return {
      ...row,
      author_name: prof?.full_name || prof?.email || null,
      author_email: prof?.email ?? null,
      fiscal_year: (row.budget_cycles as any)?.fiscal_year,
      cycle_status: (row.budget_cycles as any)?.status,
      rough_due_date: (row.budget_cycles as any)?.rough_due_date,
      sheet_link_target_date: (row.budget_cycles as any)?.sheet_link_target_date,
    } as BudgetSubmission & {
      cycle_status: CycleStatus;
      rough_due_date: string | null;
      sheet_link_target_date: string | null;
    };
  });

export const updateSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        submissionId: z.string().uuid(),
        patch: z
          .object({
            rough_status: z.enum(["not_started", "in_progress", "submitted"]).optional(),
            sheet_url: z.string().url().nullable().optional(),
            sheet_status: z
              .enum(["awaiting_link", "in_progress", "submitted", "feedback_provided", "revised"])
              .optional(),
            feedback_body: z.string().nullable().optional(),
            spending_report_path: z.string().nullable().optional(),
          })
          .strict(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await supabaseAdmin
      .from("ministry_budget_submissions")
      .select("user_id")
      .eq("id", data.submissionId)
      .maybeSingle();
    if (!row) throw new Error("Not found");
    const core = await isCore(context.userId);
    if (row.user_id !== context.userId && !core) throw new Error("Forbidden");

    // Leaders can't set sheet_url or feedback_body
    const patch: Record<string, unknown> = { ...data.patch };
    if (!core) {
      delete patch.sheet_url;
      delete patch.feedback_body;
      delete patch.spending_report_path;
    }
    const { error } = await supabaseAdmin
      .from("ministry_budget_submissions")
      .update(patch)
      .eq("id", data.submissionId);
    if (error) throw error;
    return { ok: true };
  });

export const submitRough = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ submissionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await supabaseAdmin
      .from("ministry_budget_submissions")
      .select("user_id")
      .eq("id", data.submissionId)
      .maybeSingle();
    if (!row) throw new Error("Not found");
    if (row.user_id !== context.userId && !(await isCore(context.userId))) {
      throw new Error("Forbidden");
    }
    const { error } = await supabaseAdmin
      .from("ministry_budget_submissions")
      .update({
        rough_status: "submitted",
        rough_submitted_at: new Date().toISOString(),
      })
      .eq("id", data.submissionId);
    if (error) throw error;
    return { ok: true };
  });

export const markSheetSubmitted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ submissionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await supabaseAdmin
      .from("ministry_budget_submissions")
      .select("id, user_id, ministry_area, cycle_id, sheet_url")
      .eq("id", data.submissionId)
      .maybeSingle();
    if (!row) throw new Error("Not found");
    if (row.user_id !== context.userId && !(await isCore(context.userId))) {
      throw new Error("Forbidden");
    }
    if (!row.sheet_url) throw new Error("Sheet link not posted yet");
    const { error } = await supabaseAdmin
      .from("ministry_budget_submissions")
      .update({
        sheet_status: "submitted",
        sheet_submitted_at: new Date().toISOString(),
      })
      .eq("id", data.submissionId);
    if (error) throw error;

    // Notify core users
    try {
      const { sendEmail, emailLayout, escapeHtml } = await import("@/server/email.server");
      const { data: coreRoles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "core");
      const coreIds = (coreRoles ?? []).map((r: any) => r.user_id);
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .in("id", coreIds.length ? coreIds : ["00000000-0000-0000-0000-000000000000"]);
      const to = (profs ?? []).map((p: any) => p.email).filter(Boolean);
      const { data: leader } = await supabaseAdmin
        .from("profiles")
        .select("full_name, email")
        .eq("id", row.user_id)
        .maybeSingle();
      const name = leader?.full_name || leader?.email || "A ministry leader";
      if (to.length > 0) {
        const body = emailLayout(
          `<h2>Budget request submitted</h2>
           <p>${escapeHtml(name)} just submitted their Google Sheet budget for
           <strong>${escapeHtml(row.ministry_area)}</strong>.</p>
           <p>Sheet: <a href="${escapeHtml(row.sheet_url)}">${escapeHtml(row.sheet_url)}</a></p>
           <p>Review it in the app and send feedback when ready.</p>`,
        );
        await sendEmail({
          to,
          subject: `Budget submitted: ${row.ministry_area}`,
          html: body,
        });
      }
    } catch (e) {
      console.error("Notify core (sheet submitted) failed:", e);
    }
    return { ok: true };
  });

export const submitFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        submissionId: z.string().uuid(),
        feedback: z.string().min(1).max(20000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isCore(context.userId))) throw new Error("Forbidden");
    const { data: row } = await supabaseAdmin
      .from("ministry_budget_submissions")
      .select("id, user_id, ministry_area")
      .eq("id", data.submissionId)
      .maybeSingle();
    if (!row) throw new Error("Not found");

    const { error } = await supabaseAdmin
      .from("ministry_budget_submissions")
      .update({
        feedback_body: data.feedback,
        feedback_submitted_at: new Date().toISOString(),
        reviewed_by: context.userId,
        sheet_status: "feedback_provided",
      })
      .eq("id", data.submissionId);
    if (error) throw error;

    // Notify leader
    try {
      const { sendEmail, emailLayout, escapeHtml } = await import("@/server/email.server");
      const { data: leader } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name")
        .eq("id", row.user_id)
        .maybeSingle();
      if (leader?.email) {
        const html = emailLayout(
          `<h2>Feedback on your ${escapeHtml(row.ministry_area)} budget</h2>
           <p>Hi ${escapeHtml(leader.full_name || "there")},</p>
           <p>Feedback is ready on your budget request:</p>
           <blockquote style="border-left:3px solid #ddd;padding-left:12px;color:#444">
             ${data.feedback.replace(/\n/g, "<br/>")}
           </blockquote>
           <p>Open the app to revise your sheet and re-submit when ready.</p>`,
        );
        await sendEmail({
          to: leader.email,
          subject: `Feedback on your ${row.ministry_area} budget`,
          html,
        });
      }
    } catch (e) {
      console.error("Notify leader (feedback) failed:", e);
    }
    return { ok: true };
  });

// ---------- Rough budget lines ----------

export const listRoughLines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ submissionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // access via submission owner or core
    const { data: sub } = await supabaseAdmin
      .from("ministry_budget_submissions")
      .select("user_id")
      .eq("id", data.submissionId)
      .maybeSingle();
    if (!sub) throw new Error("Not found");
    if (sub.user_id !== context.userId && !(await isCore(context.userId))) {
      throw new Error("Forbidden");
    }
    const { data: rows, error } = await supabaseAdmin
      .from("ministry_rough_budget_lines")
      .select("*")
      .eq("submission_id", data.submissionId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (rows ?? []) as RoughLine[];
  });

const RoughLinePatchSchema = z.object({
  category_id: z.string().uuid().nullable().optional(),
  category_name: z.string().max(200).optional(),
  amount_annual: z.number().min(0).max(100_000_000).optional(),
  note: z.string().max(2000).nullable().optional(),
  sort_order: z.number().int().optional(),
});

export const addRoughLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        submissionId: z.string().uuid(),
        line: RoughLinePatchSchema.extend({
          category_name: z.string().min(1).max(200),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: sub } = await supabaseAdmin
      .from("ministry_budget_submissions")
      .select("user_id")
      .eq("id", data.submissionId)
      .maybeSingle();
    if (!sub) throw new Error("Not found");
    if (sub.user_id !== context.userId && !(await isCore(context.userId))) {
      throw new Error("Forbidden");
    }
    const { data: row, error } = await supabaseAdmin
      .from("ministry_rough_budget_lines")
      .insert({
        submission_id: data.submissionId,
        category_id: data.line.category_id ?? null,
        category_name: data.line.category_name,
        amount_annual: data.line.amount_annual ?? 0,
        note: data.line.note ?? null,
        sort_order: data.line.sort_order ?? 0,
      })
      .select("*")
      .single();
    if (error) throw error;
    return row as RoughLine;
  });

export const updateRoughLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ lineId: z.string().uuid(), patch: RoughLinePatchSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await supabaseAdmin
      .from("ministry_rough_budget_lines")
      .select("submission_id, ministry_budget_submissions!inner(user_id)")
      .eq("id", data.lineId)
      .maybeSingle();
    if (!existing) throw new Error("Not found");
    const ownerId = (existing as any).ministry_budget_submissions?.user_id;
    if (ownerId !== context.userId && !(await isCore(context.userId))) {
      throw new Error("Forbidden");
    }
    const { error } = await supabaseAdmin
      .from("ministry_rough_budget_lines")
      .update(data.patch)
      .eq("id", data.lineId);
    if (error) throw error;
    return { ok: true };
  });

export const deleteRoughLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ lineId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: existing } = await supabaseAdmin
      .from("ministry_rough_budget_lines")
      .select("submission_id, ministry_budget_submissions!inner(user_id)")
      .eq("id", data.lineId)
      .maybeSingle();
    if (!existing) throw new Error("Not found");
    const ownerId = (existing as any).ministry_budget_submissions?.user_id;
    if (ownerId !== context.userId && !(await isCore(context.userId))) {
      throw new Error("Forbidden");
    }
    const { error } = await supabaseAdmin
      .from("ministry_rough_budget_lines")
      .delete()
      .eq("id", data.lineId);
    if (error) throw error;
    return { ok: true };
  });

// ---------- 10k-ft plan ----------

function normalizeHLP(row: any): HighLevelPlan {
  return {
    ...row,
    top_goals: Array.isArray(row.top_goals) ? row.top_goals : [],
    swot_seeds:
      row.swot_seeds && typeof row.swot_seeds === "object"
        ? {
            strengths: row.swot_seeds.strengths ?? [],
            weaknesses: row.swot_seeds.weaknesses ?? [],
            opportunities: row.swot_seeds.opportunities ?? [],
            threats: row.swot_seeds.threats ?? [],
          }
        : { strengths: [], weaknesses: [], opportunities: [], threats: [] },
  };
}

export const getOrCreateHighLevelPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ submissionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: sub } = await supabaseAdmin
      .from("ministry_budget_submissions")
      .select("id, user_id, ministry_area, budget_cycles!inner(fiscal_year)")
      .eq("id", data.submissionId)
      .maybeSingle();
    if (!sub) throw new Error("Not found");
    if (sub.user_id !== context.userId && !(await isCore(context.userId))) {
      throw new Error("Forbidden");
    }
    const { data: existing } = await supabaseAdmin
      .from("ministry_high_level_plans")
      .select("*")
      .eq("submission_id", data.submissionId)
      .maybeSingle();
    if (existing) return normalizeHLP(existing);

    const fy = (sub.budget_cycles as any).fiscal_year;
    const { data: row, error } = await supabaseAdmin
      .from("ministry_high_level_plans")
      .insert({
        submission_id: sub.id,
        user_id: sub.user_id,
        ministry_area: sub.ministry_area,
        fiscal_year: fy,
      })
      .select("*")
      .single();
    if (error) throw error;
    return normalizeHLP(row);
  });

export const updateHighLevelPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        planId: z.string().uuid(),
        patch: z
          .object({
            purpose: z.string().optional(),
            top_goals: z
              .array(z.object({ id: z.string(), statement: z.string(), why: z.string() }))
              .optional(),
            swot_seeds: z
              .object({
                strengths: z.array(z.string()),
                weaknesses: z.array(z.string()),
                opportunities: z.array(z.string()),
                threats: z.array(z.string()),
              })
              .optional(),
            notes: z.string().optional(),
          })
          .strict(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await supabaseAdmin
      .from("ministry_high_level_plans")
      .select("user_id")
      .eq("id", data.planId)
      .maybeSingle();
    if (!existing) throw new Error("Not found");
    if (existing.user_id !== context.userId && !(await isCore(context.userId))) {
      throw new Error("Forbidden");
    }
    const { error } = await supabaseAdmin
      .from("ministry_high_level_plans")
      .update(data.patch)
      .eq("id", data.planId);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Spending report upload / signed URL ----------

export const getSpendingReportUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        submissionId: z.string().uuid(),
        filename: z.string().min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isCore(context.userId))) throw new Error("Forbidden");
    const { data: sub } = await supabaseAdmin
      .from("ministry_budget_submissions")
      .select("user_id, cycle_id, budget_cycles!inner(fiscal_year)")
      .eq("id", data.submissionId)
      .maybeSingle();
    if (!sub) throw new Error("Not found");
    const fy = (sub.budget_cycles as any).fiscal_year;
    const path = `${fy}/${sub.user_id}/${Date.now()}-${data.filename}`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from("budget-reports")
      .createSignedUploadUrl(path);
    if (error) throw error;
    return { path, signedUrl: signed.signedUrl, token: signed.token };
  });

export const getSpendingReportDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ submissionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: sub } = await supabaseAdmin
      .from("ministry_budget_submissions")
      .select("user_id, spending_report_path")
      .eq("id", data.submissionId)
      .maybeSingle();
    if (!sub) throw new Error("Not found");
    if (sub.user_id !== context.userId && !(await isCore(context.userId))) {
      throw new Error("Forbidden");
    }
    if (!sub.spending_report_path) return { url: null };
    const { data: signed, error } = await supabaseAdmin.storage
      .from("budget-reports")
      .createSignedUrl(sub.spending_report_path, 60 * 60);
    if (error) throw error;
    return { url: signed.signedUrl };
  });

export const finalizeReportUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ submissionId: z.string().uuid(), path: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isCore(context.userId))) throw new Error("Forbidden");
    const { data: sub } = await supabaseAdmin
      .from("ministry_budget_submissions")
      .select("id, user_id, ministry_area")
      .eq("id", data.submissionId)
      .maybeSingle();
    if (!sub) throw new Error("Not found");
    const { error } = await supabaseAdmin
      .from("ministry_budget_submissions")
      .update({
        spending_report_path: data.path,
        spending_report_uploaded_at: new Date().toISOString(),
      })
      .eq("id", data.submissionId);
    if (error) throw error;

    // Notify leader
    try {
      const { sendEmail, emailLayout, escapeHtml } = await import("@/server/email.server");
      const { data: leader } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name")
        .eq("id", sub.user_id)
        .maybeSingle();
      if (leader?.email) {
        const html = emailLayout(
          `<h2>Your 12-month spending report is ready</h2>
           <p>Hi ${escapeHtml(leader.full_name || "there")},</p>
           <p>Your Feb–Feb spending report for <strong>${escapeHtml(sub.ministry_area)}</strong>
           has been posted in the app. Please review it, work through a rough budget request,
           and complete your 10,000-ft plan by March 31.</p>`,
        );
        await sendEmail({
          to: leader.email,
          subject: `Time to build your ${sub.ministry_area} budget`,
          html,
        });
      }
    } catch (e) {
      console.error("Notify leader (report ready) failed:", e);
    }
    return { ok: true };
  });

export const postSheetLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        submissionId: z.string().uuid(),
        sheetUrl: z.string().url(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isCore(context.userId))) throw new Error("Forbidden");
    const { data: sub } = await supabaseAdmin
      .from("ministry_budget_submissions")
      .select("id, user_id, ministry_area")
      .eq("id", data.submissionId)
      .maybeSingle();
    if (!sub) throw new Error("Not found");
    const { error } = await supabaseAdmin
      .from("ministry_budget_submissions")
      .update({ sheet_url: data.sheetUrl, sheet_status: "in_progress" })
      .eq("id", data.submissionId);
    if (error) throw error;

    // Notify leader
    try {
      const { sendEmail, emailLayout, escapeHtml } = await import("@/server/email.server");
      const { data: leader } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name")
        .eq("id", sub.user_id)
        .maybeSingle();
      if (leader?.email) {
        const html = emailLayout(
          `<h2>Your budget sheet is ready</h2>
           <p>Hi ${escapeHtml(leader.full_name || "there")},</p>
           <p>Your Google Sheet for the ${escapeHtml(sub.ministry_area)} budget is posted:</p>
           <p><a href="${escapeHtml(data.sheetUrl)}">${escapeHtml(data.sheetUrl)}</a></p>
           <p>When you're done, come back to the app and click "I've submitted my sheet".</p>`,
        );
        await sendEmail({
          to: leader.email,
          subject: `Your ${sub.ministry_area} budget sheet is ready`,
          html,
        });
      }
    } catch (e) {
      console.error("Notify leader (sheet link) failed:", e);
    }
    return { ok: true };
  });

// ---------- Prior-year actuals (for context) ----------

export const getPriorYearActuals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ fiscalYear: z.number().int() }).parse(d))
  .handler(async ({ data }) => {
    const priorFy = data.fiscalYear - 1;
    const { data: cats } = await supabaseAdmin
      .from("budget_categories")
      .select("id, name, kind, classification, annual_budget");
    const { data: actuals } = await supabaseAdmin
      .from("budget_actuals")
      .select("category_id, amount")
      .eq("fiscal_year", priorFy);
    const sumByCat = new Map<string, number>();
    for (const a of actuals ?? []) {
      const cur = sumByCat.get(a.category_id) ?? 0;
      sumByCat.set(a.category_id, cur + Number(a.amount ?? 0));
    }
    return (cats ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      classification: c.classification,
      annual_budget: Number(c.annual_budget ?? 0),
      prior_actual_total: sumByCat.get(c.id) ?? 0,
    }));
  });

// ---------- Utility: fiscal year for a date ----------
export function fyForDate(d: Date = new Date()) {
  return fiscalYearOf(d.getFullYear(), d.getMonth() + 1);
}

// ---------- MAP hydration seed ----------
// Called from ministry-plans createPlan flow. Returns seed patch if a matching
// un-carried 10k-ft plan exists for (user, ministry_area, fiscal_year).
export const consumeHighLevelSeedForPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        planId: z.string().uuid(),
        ministryArea: z.enum(MINISTRY_AREAS),
        fiscalYear: z.number().int(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: hlp } = await supabaseAdmin
      .from("ministry_high_level_plans")
      .select("*")
      .eq("user_id", context.userId)
      .eq("ministry_area", data.ministryArea)
      .eq("fiscal_year", data.fiscalYear)
      .is("carried_to_map_id", null)
      .maybeSingle();
    if (!hlp) return { seeded: false };
    const seed = normalizeHLP(hlp);

    // Build MAP patch
    const patch: Record<string, unknown> = {};
    if (seed.purpose) patch.purpose = seed.purpose;
    if (seed.top_goals?.length) {
      patch.goals = seed.top_goals.map((g) => ({
        id: crypto.randomUUID(),
        goal_statement: g.statement,
        completion_date: null,
        significant_others: g.why ?? "",
        execution_steps: [],
      }));
    }
    if (seed.swot_seeds.strengths.length) patch.strengths = seed.swot_seeds.strengths;
    if (seed.swot_seeds.weaknesses.length) patch.weaknesses = seed.swot_seeds.weaknesses;
    if (seed.swot_seeds.opportunities.length) patch.opportunities = seed.swot_seeds.opportunities;
    if (seed.swot_seeds.threats.length) patch.threats = seed.swot_seeds.threats;

    if (Object.keys(patch).length > 0) {
      await supabaseAdmin.from("ministry_action_plans").update(patch).eq("id", data.planId);
    }
    await supabaseAdmin
      .from("ministry_high_level_plans")
      .update({ carried_to_map_id: data.planId })
      .eq("id", hlp.id);
    return { seeded: true, source_plan_id: hlp.id };
  });
