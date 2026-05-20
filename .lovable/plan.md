## Goal

Right now the top cards (Annual budget, Annual variance, Pacing) are wrong because annual budget is being inferred from the monthly YTD report. Real source of truth in QBO is the **Budget Overview** export (annual budget by account). We'll import that first, then layer monthly Budget vs. Actuals on top — and never let the monthly file overwrite annual numbers.

## What you'll see on the Finance page

Under **Manage → Imports**, two clearly separated upload areas:

1. **Annual budget (one per fiscal year)** — upload QBO's Budget Overview as CSV or XLSX. Shows last upload date + a "Re-upload" button.
2. **Monthly Budget vs. Actuals** — unchanged workflow, but the review dialog no longer asks about annual budget at all.

The dashboard cards use annual figures only from step 1, so "Annual budget" stops reading $0.

## Implementation

### 1. Parser
- New `src/lib/parse-qbo-budget.ts` exporting `parseQboBudget(input: string | ArrayBuffer, filename: string): { fiscalYear?, lines: { name, indent, annualBudget }[], ignored: string[] }`.
- Detect file type by extension; route XLSX through SheetJS (`xlsx` package — installed via `bun add xlsx`) and CSV through Papa Parse (already in use).
- Column detection: look for the rightmost numeric column on the header row (QBO Budget Overview is `Account | Jul | Aug | … | Jun | Total`). Use the **Total** column as annual budget; if missing, sum the 12 month columns.
- Reuse subtotal/total-row filters from `parse-qbo-csv.ts` (extract `isTotalRow`, `parseNumber`, `normalize`, `matchCategory` into a shared `src/lib/qbo-shared.ts` so both parsers use them).
- Reuse `detectHeaderInfo` for fiscal year (Jul–Jun convention already correct).

### 2. Server function
- New `src/server/finance-budget.functions.ts` → `applyAnnualBudget`:
  - Input: `{ fiscalYear, lines: [{ categoryId|null, createAs|null, annualBudget }] }`.
  - Auth: `requireSupabaseAuth` + core-role check.
  - For each line: create category if `createAs`, else `update annual_budget = annualBudget where id = categoryId`.
  - Dedup by category_id (same pattern as snapshot apply) so duplicate account names sum cleanly.
  - Return `{ updated, created }`.

### 3. UI
- New `src/components/finance/AnnualBudgetDialog.tsx` modeled on `SnapshotReviewDialog`: file drop, parse, show table of `Line | Annual budget | Maps to`, with the same category-match/create selector. No "as of month" or "full year" fields.
- In `src/routes/finance.tsx`, in the existing Imports section, add an "Annual budget" card above the monthly reports list with last-imported indicator (derived from `max(updated_at)` on `budget_categories` for that FY) and a "Upload annual budget" button that opens the new dialog.

### 4. Strip annual-budget logic from monthly import
- `SnapshotReviewDialog.tsx`: remove the "Full-year report" checkbox, the `fiscalMonthIndex` extrapolation, and stop sending `annualBudget` / `updateAnnualBudgets`.
- `applyFinanceSnapshot` (server fn): drop `updateAnnualBudgets` from the schema; only write snapshot lines (ytd_actual, ytd_budget). Stop writing to `budget_categories.annual_budget` entirely.
- The recent "backfill when annual_budget = 0" branch is removed too — annual budgets are now owned by the annual import.

### 5. Dashboard cards
- `src/routes/finance.tsx` already reads `totals.annualBudget` from `budget_categories`. No formula change needed — once the annual file is imported, the cards become accurate. Empty-state hint updates: "Upload your annual budget first, then monthly Budget vs. Actuals reports."

## Files touched

Created:
- `src/lib/parse-qbo-budget.ts`
- `src/lib/qbo-shared.ts` (extracted helpers)
- `src/server/finance-budget.functions.ts`
- `src/components/finance/AnnualBudgetDialog.tsx`

Edited:
- `src/lib/parse-qbo-csv.ts` (import shared helpers)
- `src/server/finance-snapshot.functions.ts` (remove annual writes)
- `src/components/finance/SnapshotReviewDialog.tsx` (remove full-year + extrapolation)
- `src/routes/finance.tsx` (annual-budget card + dialog wiring, empty-state copy)

Dependency added: `xlsx` (SheetJS).

## Out of scope

- No schema changes — `budget_categories.annual_budget` is the right home already.
- No historical re-import; you'll re-upload the annual budget once after this ships.
