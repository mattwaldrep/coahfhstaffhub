import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { inferClassification } from "@/lib/budget-classification";

const MonthlySchema = z.record(z.string().regex(/^([1-9]|1[0-2])$/), z.number());

const ImportRowSchema = z.object({
  categoryId: z.string().uuid().nullable(),
  createAs: z.string().min(1).max(120).nullable(),
  annualBudget: z.number().min(0).max(100_000_000).optional(),
  monthly: MonthlySchema,
});

const ApplySchema = z.object({
  reportId: z.string().uuid(),
  fiscalYear: z.number().int().min(2000).max(2100),
  rows: z.array(ImportRowSchema).min(1).max(500),
});

export const applyFinanceImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ApplySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify user is core
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isCore = (roles ?? []).some((r) => r.role === "core");
    if (!isCore) throw new Error("Core access required");

    let createdCategories = 0;
    let cellsWritten = 0;

    for (const row of data.rows) {
      let categoryId = row.categoryId;
      if (!categoryId && row.createAs) {
        const { data: created, error: createErr } = await supabase
          .from("budget_categories")
          .insert({
            name: row.createAs,
            fiscal_year: data.fiscalYear,
            annual_budget: row.annualBudget ?? 0,
            classification: inferClassification(row.createAs, "expense"),
          })
          .select("id")
          .single();
        if (createErr) throw new Error(`Couldn't create category "${row.createAs}": ${createErr.message}`);
        categoryId = created.id;
        createdCategories++;
      }
      if (!categoryId) continue;

      const monthlyEntries = Object.entries(row.monthly);
      if (monthlyEntries.length === 0) continue;

      const payload = monthlyEntries.map(([m, amount]) => ({
        category_id: categoryId!,
        fiscal_year: data.fiscalYear,
        month: Number(m),
        amount,
      }));

      const { error: upsertErr } = await supabase
        .from("budget_actuals")
        .upsert(payload, { onConflict: "category_id,fiscal_year,month" });
      if (upsertErr) throw new Error(`Couldn't write actuals: ${upsertErr.message}`);
      cellsWritten += payload.length;
    }

    await supabase
      .from("finance_reports")
      .update({ imported_at: new Date().toISOString(), imported_by: userId })
      .eq("id", data.reportId);

    return { createdCategories, cellsWritten };
  });
