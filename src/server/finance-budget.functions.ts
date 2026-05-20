import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LineSchema = z.object({
  categoryId: z.string().uuid().nullable(),
  createAs: z.string().min(1).max(200).nullable(),
  annualBudget: z.number(),
});

const ApplySchema = z.object({
  fiscalYear: z.number().int().min(2000).max(2100),
  lines: z.array(LineSchema).min(1).max(500),
});

export const applyAnnualBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ApplySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r) => r.role === "core")) {
      throw new Error("Core access required");
    }

    // Dedup by category_id (or by createAs name when creating)
    const byKey = new Map<string, { categoryId: string | null; createAs: string | null; annualBudget: number }>();
    for (const line of data.lines) {
      const key = line.categoryId ?? `new::${(line.createAs ?? "").toLowerCase()}`;
      const prev = byKey.get(key);
      if (prev) prev.annualBudget += line.annualBudget;
      else byKey.set(key, { ...line });
    }

    let created = 0;
    let updated = 0;
    for (const v of byKey.values()) {
      let categoryId = v.categoryId;
      if (!categoryId && v.createAs) {
        const { data: row, error } = await supabase
          .from("budget_categories")
          .insert({
            name: v.createAs,
            fiscal_year: data.fiscalYear,
            annual_budget: v.annualBudget,
          })
          .select("id").single();
        if (error) throw new Error(`Couldn't create category "${v.createAs}": ${error.message}`);
        categoryId = row.id;
        created++;
        continue;
      }
      if (!categoryId) continue;

      const { error } = await supabase
        .from("budget_categories")
        .update({ annual_budget: v.annualBudget })
        .eq("id", categoryId);
      if (error) throw new Error(`Couldn't update annual budget: ${error.message}`);
      updated++;
    }

    return { created, updated };
  });
