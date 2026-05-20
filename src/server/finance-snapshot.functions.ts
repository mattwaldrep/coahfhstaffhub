import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { inferClassification } from "@/lib/budget-classification";

const LineSchema = z.object({
  categoryId: z.string().uuid().nullable(),
  createAs: z.string().min(1).max(200).nullable(),
  ytdActual: z.number(),
  ytdBudget: z.number(),
});

const ApplySchema = z.object({
  fiscalYear: z.number().int().min(2000).max(2100),
  asOfMonth: z.number().int().min(1).max(12),
  sourceReportId: z.string().uuid().nullable(),
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

    // Resolve every line to a category_id (create if needed).
    // New categories created here get annual_budget=0; the annual-budget
    // import owns that value.
    let createdCategories = 0;
    const resolved: { categoryId: string; ytdActual: number; ytdBudget: number }[] = [];

    for (const line of data.lines) {
      let categoryId = line.categoryId;
      if (!categoryId && line.createAs) {
        const { data: created, error } = await supabase
          .from("budget_categories")
          .insert({
            name: line.createAs,
            fiscal_year: data.fiscalYear,
            annual_budget: 0,
            classification: inferClassification(line.createAs, "expense"),
          })
          .select("id").single();
        if (error) throw new Error(`Couldn't create category "${line.createAs}": ${error.message}`);
        categoryId = created.id;
        createdCategories++;
      }
      if (!categoryId) continue;

      resolved.push({
        categoryId,
        ytdActual: line.ytdActual,
        ytdBudget: line.ytdBudget,
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
      const byCat = new Map<string, { ytdActual: number; ytdBudget: number }>();
      for (const r of resolved) {
        const prev = byCat.get(r.categoryId);
        if (prev) {
          prev.ytdActual += r.ytdActual;
          prev.ytdBudget += r.ytdBudget;
        } else {
          byCat.set(r.categoryId, { ytdActual: r.ytdActual, ytdBudget: r.ytdBudget });
        }
      }
      const payload = Array.from(byCat.entries()).map(([category_id, v]) => ({
        snapshot_id: snapshotId,
        category_id,
        ytd_actual: v.ytdActual,
        ytd_budget: v.ytdBudget,
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
