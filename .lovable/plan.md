
## Recommended export format

**CSV** from QBO. Reasons:
- Deterministic columns, no layout drift between months (PDF reflows, breaks parsing).
- No OAuth or external API needed (Google Sheets would).
- XLSX works but adds a parsing dependency; CSV gets us 100% of what we need.
- We'll also accept **.xlsx** as a convenience (parsed via SheetJS), but CSV is the primary path.

PDF stays supported as a fallback (existing parser), but we'll mark it "best-effort".

## How the QBO report maps to the app

A QBO "Budget vs. Actuals" report run as **Fiscal Year-to-Date** gives one row per account with these columns:

```
Account | Actual | Budget | Over Budget | % of Budget
```

Two important facts about that report:
1. The **Budget** column is the YTD budget (sum of monthly budgets up to the "as of" month), not the annual budget.
2. The **Actual** column is YTD actual through the "as of" month.

So each upload is a **point-in-time YTD snapshot** for a single "as-of month". That matches your workflow ("run it monthly, load it in").

To also know the **annual** budget (so the dashboard can show "YTD vs. full-year"), we ask the user to either:
- run the same report once with date range = full fiscal year (gives annual budget per line), **or**
- run a one-time **Profit & Loss Budget Overview** export.

The first upload of the FY does both jobs: seeds categories AND captures annual budget. Subsequent uploads just refresh YTD actuals.

## Data model change

Replace the per-month `budget_actuals` cell grid with a snapshot model:

```
finance_snapshots
  id, fiscal_year, as_of_month, source_report_id, created_at

finance_snapshot_lines
  snapshot_id, category_id, ytd_actual, ytd_budget, annual_budget (nullable)

budget_categories  -- unchanged, but annual_budget now comes from imports
```

Why snapshots instead of per-month cells:
- Matches what QBO actually gives us (YTD totals, not per-month).
- Idempotent: re-uploading April just replaces the April snapshot.
- Lets the dashboard show a trend ("YTD actual at end of Jan, Feb, Mar, …") for free.
- Variance math becomes trivial: `annual_budget - latest_snapshot.ytd_actual`.

Existing `budget_actuals` per-month editing stays available for manual adjustments, but the dashboard's primary numbers come from the latest snapshot.

## Ingestion flow

1. User clicks **Upload monthly report** → picks CSV/XLSX → picks "as-of month".
2. Parser reads rows, classifies each as **Income**, **Expense**, **Subtotal** (skipped), or **Total** (skipped) using QBO's indentation + keyword rules.
3. Auto-match each line's account name against existing `budget_categories` (exact → case-insensitive → fuzzy ≤2 edits).
4. **Review dialog** shows:
   - Detected as-of month + fiscal year (editable)
   - Green: matched lines (ytd_actual, ytd_budget)
   - Amber: unmatched lines → dropdown to map OR "Create new category" (pre-fills name + annual budget from Budget column when full-year report)
   - Grey: ignored lines (subtotals/totals)
   - Checkbox: **"This is a full-year report — use the Budget column as annual budget"** (auto-checked when as-of month = 12 or date range spans full FY).
5. On confirm: server fn writes the snapshot, upserts categories, optionally updates each category's `annual_budget`.

## Dashboard rebuild

Budget vs. Actuals tab becomes:
- **Top strip**: As of {Month} {Year} · Total annual budget · YTD actual · Variance · % of year elapsed vs. % of budget spent (pacing indicator).
- **Table**: Category | Annual budget | YTD actual | YTD budget | Variance vs. YTD budget | Variance vs. annual | Spark of YTD actual across all snapshots this FY.
- **Snapshot picker**: dropdown to view any prior month's snapshot (audit trail).
- Manual per-month cell editing moved to a secondary "Adjustments" view (keeps existing UI for users who want fine-grained entry).

## Files

**New**
- `src/lib/parse-qbo-csv.ts` — CSV + XLSX → `{ asOfMonth?, fiscalYear?, lines: [{ name, ytdActual, ytdBudget, indent }] }`
- `src/server/finance-snapshot.functions.ts` — `applyFinanceSnapshot` server fn (writes snapshot, upserts categories, updates annual_budget)
- `src/components/finance/SnapshotReviewDialog.tsx` — replaces ImportReviewDialog for the new flow

**Edited**
- `src/routes/finance.tsx` — new BudgetTab using snapshots, snapshot picker, updated upload flow

**Kept**
- `src/lib/parse-finance-pdf.ts` + existing PDF import — available as fallback, not primary path
- Existing `budget_categories` / `budget_actuals` tables — `budget_actuals` becomes optional manual-adjustment store

**Dependencies**
- `papaparse` (CSV) — ~45KB, pure JS, fine for the worker runtime
- `xlsx` aka SheetJS — optional, only loaded when an .xlsx is dropped

**Migration**
- New tables `finance_snapshots`, `finance_snapshot_lines` with RLS (core only)
- No destructive change to existing tables

## Out of scope

- Direct QBO API integration (would need OAuth + Intuit dev app + per-user tokens)
- Per-month *actuals* breakdown from the FYTD report (QBO doesn't include it in this report shape)
- Cash-flow / balance-sheet reports

## Questions before I build

1. **One report or two?** The cleanest flow is: every upload is the FYTD Budget vs. Actuals report. The first upload of each FY (or any upload run for the full fiscal year) also captures annual budgets. Sound right, or do you want a separate "annual budget" upload?
2. **Fiscal year**: confirm your FY is calendar year (Jan–Dec)? QBO supports non-calendar FYs and the parser needs to know.
3. **Account hierarchy**: keep QBO's parent/child indentation (e.g. "Payroll Expenses > Salaries"), or flatten to leaf accounts only?
