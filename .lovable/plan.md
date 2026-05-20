# Robust finance report ingestion

## Problem

Today, uploading a PDF to **Finance → Monthly reports** just drops a file in storage. Nothing reads it, so **Budget vs. actuals** stays empty and you can't tell why. You expected the upload to feed the grid.

## What your reports actually contain

The April PDF you uploaded is a Parable "Management Report" with these usable sections:

- **Statement of Activity by Month Summary** — every category × every month of the FY in one table (Jul 2025 → Apr 2026), with a Total column. This is the gold mine for populating the grid.
- **Budget vs. Actuals YTD Summary** — annual budget per category (so we can refresh `annual_budget` too, if you want).
- **Budget vs. Actuals Last Month Detail** — single-month actuals + budget per line.

So the parser can populate **many months at once**, not just one.

## How it will work

```text
Upload PDF ──► Parse on server ──► Review screen ──► Write to grid
                                       │
                                       └─ unmatched categories listed,
                                          user picks: map to existing,
                                          create new, or skip
```

### 1. Server-side parser (`src/server/finance-parse.functions.ts`)
- New `createServerFn` `parseFinanceReport({ reportId })` using `pdfjs-dist` (already in the project for metrics parsing — Worker-compatible, no native deps).
- Downloads the PDF from storage via `supabaseAdmin`, extracts text per page grouped by Y coord (same approach as `src/lib/parse-metrics-pdf.ts`).
- Recognizes two report shapes:
  - **Parable "Statement of Activity by Month"** → returns `{ rows: [{ name, fiscal_year, monthly: {1: 1234.56, …} }] }`.
  - **Generic single-month list** (fallback) → returns `{ rows: [{ name, month, amount }] }`.
- Detects fiscal year from header text (`For the period ended … 2026`) and the column months.
- Stores the parsed structure in `finance_reports.parsed_metrics` (column already exists) so a second click doesn't re-parse.
- Returns a preview: matched rows, unmatched rows, totals, detected period.

### 2. Auto-match logic (server)
- Normalize names: lowercase, strip GL-account prefixes (`4000 Tithes & Offering` → `tithes & offering`), collapse whitespace, drop punctuation.
- Match against existing `budget_categories` for that fiscal year by:
  1. Exact normalized name
  2. Case-insensitive substring (both directions)
  3. Tiny edit-distance (≤2) for typos
- Skip noise rows: `Total Revenue`, `GROSS PROFIT`, `Total Expenditures`, `NET …`, `Uncategorized …` (configurable).

### 3. Review UI (in `src/routes/finance.tsx` Reports tab)
- New "Import to budget" button on each uploaded report card (only enabled once parsed).
- Opens a dialog showing:
  - **Detected period** (FY + months covered) with a confirm/override.
  - **Matched** (green): `Source name → Category name`, with monthly amounts preview, "uncheck to skip" toggle.
  - **Unmatched** (amber): each row gets a `<Select>` to map to an existing category, a "Create as new category" button, or "Skip".
  - **Ignored** (collapsed): totals/subtotals rows we filtered out, so it's transparent.
- "Import" button writes via a second server fn `applyFinanceImport({ reportId, mappings, overwrite })`:
  - For each (category, month) it **upserts** `budget_actuals` (replace existing amount for that cell — show a "will overwrite N existing cells" warning before commit).
  - Creates any new categories the user requested.
  - Records `imported_at` + `imported_by` on `finance_reports` so the card shows "Imported May 20".

### 4. UX polish on the Reports tab
- File-shape badge on each card: `Unparsed`, `Parsed — ready to import`, `Imported`.
- Auto-trigger parse right after upload finishes (so the common case is one click: upload → review → import).
- Show parse errors inline ("Couldn't find a recognized table — open the file to import manually").
- Accept `.pdf`, `.xlsx`, `.csv` in the file picker; only PDF is parsed in v1, others stay store-only with a clear "Manual entry only" badge (XLSX/CSV can come later).

### 5. Schema additions (one small migration)

```sql
alter table public.finance_reports
  add column if not exists imported_at timestamptz,
  add column if not exists imported_by uuid;

create unique index if not exists budget_actuals_unique_cell
  on public.budget_actuals (category_id, fiscal_year, month);
```

The unique index makes the upsert safe and prevents double-entry from a re-import.

## Out of scope (call out so you can ask for it later)

- XLSX / CSV parsing (only PDF in v1).
- Touching `annual_budget` from the report (we'll only write monthly actuals; budgets stay user-edited unless you ask).
- Auto-importing without the review screen.

## Files touched

- `src/server/finance-parse.functions.ts` *(new)* — parser + apply server fns
- `src/lib/parse-finance-pdf.ts` *(new)* — pure text-extraction helpers, mirrors `parse-metrics-pdf.ts`
- `src/routes/finance.tsx` — Reports tab: badges, "Import to budget" button, review dialog
- `src/components/finance/ImportReviewDialog.tsx` *(new)* — the mapping UI
- one migration for `imported_at/by` + unique index
