// Parses a QuickBooks Online "Budget Overview" export — the source of truth
// for the annual budget by account. Supports CSV (Papa Parse) and XLSX
// (SheetJS). Layout is typically:
//   Account | Jul | Aug | … | Jun | Total
// We grab the "Total" column when present; otherwise sum the 12 month cols.

import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  parseNumber,
  isTotalRow,
  detectHeaderInfo,
} from "./parse-qbo-csv";

export type AnnualBudgetLine = {
  name: string;
  annualBudget: number;
  indent: number;
};

export type AnnualBudgetParseResult = {
  fiscalYear?: number;
  lines: AnnualBudgetLine[];
  ignored: string[];
};

const MONTH_HEADER_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)(?:\w*)\b/;

export async function parseQboBudget(
  file: File,
): Promise<AnnualBudgetParseResult> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  let rows: string[][];
  if (ext === "xlsx" || ext === "xls") {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    // Pick the first sheet whose header has month columns. QBO budget exports
    // include a "Guidelines" sheet first; the data lives on a later sheet
    // (e.g. "Consolidated").
    let chosenRows: string[][] = [];
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      const r = XLSX.utils.sheet_to_json<string[]>(ws, {
        header: 1,
        blankrows: false,
        raw: false,
        defval: "",
      }) as string[][];
      const hasMonths = r.slice(0, 10).some((row) => {
        const lc = (row ?? []).map((c) => (c ?? "").toString().trim().toLowerCase());
        return lc.filter((c) => MONTH_HEADER_RE.test(c)).length >= 6;
      });
      if (hasMonths) {
        chosenRows = r;
        break;
      }
      if (!chosenRows.length) chosenRows = r;
    }
    rows = chosenRows;
  } else {
    const text = await file.text();
    rows = (Papa.parse<string[]>(text, { skipEmptyLines: false }).data ?? []) as string[][];
  }

  return parseRows(rows);
}

function parseRows(rows: string[][]): AnnualBudgetParseResult {
  const headerText = rows.slice(0, 8).map((r) => r.join(" ")).join("\n");
  const { fiscalYear } = detectHeaderInfo(headerText);

  // Find the column header row containing month names or a totals column.
  let headerRow = -1;
  let totalCol = -1;
  let monthCols: number[] = [];

  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const r = rows[i] ?? [];
    const lc = r.map((c) => (c ?? "").toString().trim().toLowerCase());

    const tIdx = lc.findIndex(
      (c) =>
        c === "total" ||
        c === "budget totals" ||
        c === "budget total" ||
        /annual\s*(budget|total)/.test(c) ||
        /total\s*budget/.test(c),
    );
    const monthIdxs = lc
      .map((c, idx) => (MONTH_HEADER_RE.test(c) ? idx : -1))
      .filter((idx) => idx >= 0);

    if (monthIdxs.length >= 6 || tIdx > 0) {
      headerRow = i;
      totalCol = tIdx;
      monthCols = monthIdxs;
      break;
    }
  }

  if (headerRow === -1) {
    // Fallback: assume rightmost numeric column is the annual total
    headerRow = 0;
  }

  const lines: AnnualBudgetLine[] = [];
  const ignored: string[] = [];

  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const rawName = (r[0] ?? "").toString();
    const name = rawName.trim();
    if (!name) continue;

    if (isTotalRow(name)) {
      ignored.push(name);
      continue;
    }

    let annual: number | null = null;
    if (totalCol > 0) {
      annual = parseNumber(r[totalCol]);
    }
    if (annual == null || annual === 0) {
      // Sum month columns if a Total column wasn't found or was blank
      if (monthCols.length) {
        let sum = 0;
        let any = false;
        for (const c of monthCols) {
          const n = parseNumber(r[c]);
          if (n != null) { sum += n; any = true; }
        }
        annual = any ? sum : annual;
      }
    }
    if (annual == null) {
      // Last resort: rightmost numeric cell on the row
      for (let c = r.length - 1; c >= 1; c--) {
        const n = parseNumber(r[c]);
        if (n != null) { annual = n; break; }
      }
    }

    if (annual == null) {
      ignored.push(name);
      continue;
    }

    const indent = rawName.length - rawName.trimStart().length;
    lines.push({ name, annualBudget: annual, indent });
  }

  return { fiscalYear, lines, ignored };
}
