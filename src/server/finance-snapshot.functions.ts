import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LineSchema = z.object({
  categoryId: z.string().uuid().nullable(),
  createAs: z.string().min(1).max(200).nullable(),
  ytdActual: z.number(),
  ytdBudget: z.number(),
  annualBudget: z.number().nullable(),
});

const ApplySchema = z.object({
  fiscalYear: z.number().int().min(2000).max(2100),
  asOfMonth: z.number().int().min(1).max(12),
  sourceReportId: z.string().uuid().nullable(),
  updateAnnualBudgets: z.boolean(),
  lines: z.array(LineSchema).min(1).max(500),
});

export const applyFinanceSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ApplySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r) => r.role === "core")) {
      throw new Error("Core access required");
    }

    // Resolve every line to a category_id (create if needed)
    let createdCategories = 0;
    const resolved: { categoryId: string; ytdActual: number; ytdBudget: number; annualBudget: number | null }[] = [];

    for (const line of data.lines) {
      let categoryId = line.categoryId;
      if (!categoryId && line.createAs) {
        const { data: created, error } = await supabase
          .from("budget_categories")
          .insert({
            name: line.createAs,
            fiscal_year: data.fiscalYear,
            annual_budget: line.annualBudget ?? 0,
          })
          .select("id").single();
        if (error) throw new Error(`Couldn't create category "${line.createAs}": ${error.message}`);
        categoryId = created.id;
        createdCategories++;
      }
      if (!categoryId) continue;

      if (data.updateAnnualBudgets && line.annualBudget != null) {
        await supabase
          .from("budget_categories")
          .update({ annual_budget: line.annualBudget })
          .eq("id", categoryId);
      } else if (line.annualBudget != null && line.annualBudget > 0) {
        // Backfill: if this category was created earlier with annual_budget=0
        // (partial-year import before extrapolation existed), fill it in now.
        await supabase
          .from("budget_categories")
          .update({ annual_budget: line.annualBudget })
          .eq("id", categoryId)
          .eq("annual_budget", 0);
      }

      resolved.push({
        categoryId,
        ytdActual: line.ytdActual,
        ytdBudget: line.ytdBudget,
        annualBudget: line.annualBudget,
      });
    }

    // Upsert snapshot (unique on fiscal_year + as_of_month)
    const { data: existing } = await supabase
      .from("finance_snapshots")
      .select("id")
      .eq("fiscal_year", data.fiscalYear)
      .eq("as_of_month", data.asOfMonth)
      .maybeSingle();

    let snapshotId: string;
    if (existing) {
      snapshotId = existing.id;
      await supabase
        .from("finance_snapshots")
        .update({
          source_report_id: data.sourceReportId,
          created_by: userId,
        })
        .eq("id", snapshotId);
      // Wipe old lines
      await supabase.from("finance_snapshot_lines").delete().eq("snapshot_id", snapshotId);
    } else {
      const { data: created, error } = await supabase
        .from("finance_snapshots")
        .insert({
          fiscal_year: data.fiscalYear,
          as_of_month: data.asOfMonth,
          source_report_id: data.sourceReportId,
          created_by: userId,
        })
        .select("id").single();
      if (error) throw new Error(`Couldn't create snapshot: ${error.message}`);
      snapshotId = created.id;
    }

    if (resolved.length > 0) {
      // Dedup by category_id — table has UNIQUE(snapshot_id, category_id).
      // Multiple parsed lines can map to the same category (duplicate account
      // names, or user mapped two lines to one existing category). Sum values
      // so the insert succeeds instead of throwing a duplicate-key error
      // (which surfaces as "[object Response]" on the client).
      const byCat = new Map<string, { ytdActual: number; ytdBudget: number; annualBudget: number | null }>();
      for (const r of resolved) {
        const prev = byCat.get(r.categoryId);
        if (prev) {
          prev.ytdActual += r.ytdActual;
          prev.ytdBudget += r.ytdBudget;
          if (r.annualBudget != null) prev.annualBudget = (prev.annualBudget ?? 0) + r.annualBudget;
        } else {
          byCat.set(r.categoryId, { ytdActual: r.ytdActual, ytdBudget: r.ytdBudget, annualBudget: r.annualBudget });
        }
      }
      const payload = Array.from(byCat.entries()).map(([category_id, v]) => ({
        snapshot_id: snapshotId,
        category_id,
        ytd_actual: v.ytdActual,
        ytd_budget: v.ytdBudget,
        annual_budget: v.annualBudget,
      }));
      const { error } = await supabase.from("finance_snapshot_lines").insert(payload);
      if (error) throw new Error(`Couldn't write snapshot lines: ${error.message}`);
    }

    if (data.sourceReportId) {
      await supabase
        .from("finance_reports")
        .update({ imported_at: new Date().toISOString(), imported_by: userId })
        .eq("id", data.sourceReportId);
    }

    return {
      snapshotId,
      createdCategories,
      linesWritten: resolved.length,
    };
  });
