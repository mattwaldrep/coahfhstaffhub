
## Goal

Teach the finance module about the difference between operational money and fund-raised church-planting money so it stops reporting a single misleading "Net". Surface three layered metrics on the dashboard, and split the budget tables to match.

## The model

Today `budget_categories.kind` is just `income | expense`. That's not enough — `4501 Release of Restricted Funds - Payroll` reads as income but is really a bookkeeping bridge, and `9500 Designated Expense` rolls up church-planting fund-raised costs that should not weigh on operational health.

Add a new column `classification` with four values:

- `operating_income` — Tithes & Offering and other above-the-line income (default for `4xxx` accounts that aren't the bridge)
- `bridge_income` — Release of Restricted Funds for payroll (account `4501*`)
- `operating_expense` — normal above-the-line expenses (default for all expense accounts)
- `designated_expense` — fund-raised church-planting costs (account `9500*` and its children, e.g. Cameron Sardano CP Expense, Matt Waldrep CP Expense, Steven Castello CP Expense)

`kind` stays as the high-level income/expense flag; `classification` is the layer.

## Schema (one migration)

- Add `classification text NOT NULL DEFAULT 'operating_expense'` to `budget_categories` with a `CHECK` constraint over the four values.
- Backfill existing rows from name/account-number heuristics:
  - name starts with `4501` → `bridge_income`
  - `kind = 'income'` (and not above) → `operating_income`
  - name starts with `9500` or matches `*CP Expense*` → `designated_expense`
  - everything else → `operating_expense`

## Auto-classification on import

In `src/lib/parse-qbo-budget.ts` and `src/lib/parse-qbo-csv.ts`, infer a default classification per line from the leading account number / name (same rules as the backfill). Pass it through `AnnualBudgetLine` and into the review dialog.

In `src/components/finance/AnnualBudgetDialog.tsx` and `ImportReviewDialog.tsx`, add a small "Layer" select per row (Operating / Bridge / Designated) so the user can correct mismatches before applying. Persist via the existing `applyAnnualBudget` / import server fns — extend the Zod schemas with the new field, and write it on insert/update of `budget_categories`.

`finance_snapshot_lines` doesn't need a new column; the layer is read off `budget_categories.classification` at render time.

## Dashboard rewrite (`src/routes/finance.tsx`)

Replace the current 4-Stat strip + two flat tables with:

**Three layered Stat cards** (YTD value, annual projection sub-line, color-coded):

```text
Core Local Margin            Net Operating Income         Total Org Cash Flow
Tithes − Operating Expense   (Tithes + Bridge) − Op Exp   All Income − All Expense
expected negative; info tone   target ≈ $0; warn if far off  neutral
```

Formulas, applied across both YTD (from selected snapshot) and annual (from category budgets):

- `coreLocalMargin   = sum(operating_income)                       − sum(operating_expense)`
- `netOperating      = sum(operating_income) + sum(bridge_income)  − sum(operating_expense)`
- `totalCashFlow     = sum(all income)                             − sum(all expense)`

Pacing stat stays but pulls from `operating_expense` only (designated spend is donor-driven, not pace-driven).

**Tables**, in this order, each with the same column shape as today:

1. Operating Income
2. Bridge Income (Release of Restricted Funds) — small explanatory caption
3. Operating Expense
4. Designated Expense (Fund-raised) — small caption: "Fund-raised church-planting costs. Tracked separately so they don't distort operational health."

Each section uses the existing `renderCategoryTable` with one new arg for the section caption.

## Out of scope

- Charts beyond the existing per-category sparklines (the user said "dashboard and charts" but the only charts today are sparklines; the three stat cards are the primary layered view).
- A separate "Designated income" layer for non-payroll restricted releases — only the payroll bridge is called out in the prompt; the picker still lets a user assign `bridge_income` to other release accounts later if needed.
- Changing how QBO files are uploaded, parsed for asOfMonth, or how snapshots are built.

## Files touched

- new migration: add `classification` column + backfill
- `src/lib/parse-qbo-budget.ts`, `src/lib/parse-qbo-csv.ts` — infer default classification
- `src/server/finance-budget.functions.ts`, `src/server/finance-import.functions.ts`, `src/server/finance-snapshot.functions.ts` — Zod + insert/update wiring
- `src/components/finance/AnnualBudgetDialog.tsx`, `ImportReviewDialog.tsx` — Layer picker per row
- `src/routes/finance.tsx` — three layered metrics + four-section tables
