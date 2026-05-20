## What's wrong

The QBO export groups rows under section headers ("Income", "Cost of Goods Sold", "Expense", "Other Income", "Other Expense"). The current importer ignores those headers and dumps every line into one flat list of "budget categories." The dashboard then sums **everything** as one annual budget number — so tithes/offering revenue gets added on top of payroll and rent. That's why the totals look nonsensical.

It also imports rollup parents and $0 placeholder accounts, which clutters the category list.

## Fix

### 1. Schema: tag each category
Add `kind` to `budget_categories`:
- `income` — revenue accounts (Income, Other Income)
- `expense` — spending accounts (Cost of Goods Sold, Expense, Other Expense)

Default existing rows to `expense` (legacy data is cleared anyway).

### 2. Parser: track the current section
Walk the sheet top-to-bottom. Whenever column A is a section header at indent 0 (`Income`, `Cost of Goods Sold`, `Expense`, `Other Income`, `Other Expense`), flip an `kind` flag. Tag each subsequent leaf line with that kind. Skip:
- Section headers themselves
- "Total …" subtotal rows (already ignored)
- Rows whose annual is `0` or blank (parent rollups and unused accounts)

### 3. Review dialog: show the split
In `AnnualBudgetDialog`, group the parsed lines into two tables — **Income** and **Expense** — each with its own subtotal. The user can still un-check rows they don't want imported.

### 4. Server function: persist the kind
`applyAnnualBudget` writes `kind` alongside `annual_budget` when creating/updating `budget_categories`.

### 5. Dashboard cards: stop combining them
On `/finance`, replace the single "Annual budget" total with three numbers:
- **Annual income budget** = sum of `kind = 'income'`
- **Annual expense budget** = sum of `kind = 'expense'`
- **Projected surplus / (deficit)** = income − expense

Budget-vs-actuals lists also split into Income and Expense sections so a $200k tithes line never sits next to a $25k rent line in the same ranking.

### Out of scope
- No changes to the monthly snapshot importer's math (it still just writes YTD actual/budget per category — those categories now carry a `kind`, which lets the dashboard group them correctly automatically).
- No re-import of historical data needed; the finance module was just wiped.

### Technical notes
- Migration adds `kind text not null default 'expense' check (kind in ('income','expense'))` on `budget_categories`.
- `parse-qbo-budget.ts` returns `lines: { name, annualBudget, indent, kind }[]`.
- `finance_snapshot_lines` doesn't need a `kind` column — it joins to `budget_categories` for kind.
