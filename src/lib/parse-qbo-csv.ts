// Parses a QuickBooks Online "Budget vs. Actuals" CSV export.
// QBO layout (header row varies, but typical columns):
//   "" | "Actual" | "Budget" | "Over Budget" | "% of Budget"
// First column holds account names with leading whitespace indicating
// indentation. Subtotal/Total rows look like "Total Income", "GROSS PROFIT",
// "Net Operating Income" etc.

import Papa from "papaparse";

export type QboLine = {
  name: string;
  ytdActual: number;
  ytdBudget: number;
  indent: number;
};

export type QboParseResult = {
  asOfMonth?: number;     // 1-12 if detected from header text
  fiscalYear?: number;    // detected from header text
  fullYear: boolean;      // true if report spans a full FY
  lines: QboLine[];
  ignored: string[];      // skipped subtotal/total rows for transparency
};

const MONTH_NAMES = [
  "january","february","march","april","may","june",
  "july","august","september","october","november","december",
];

function parseNumber(raw: unknown): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s || s === "-" || s === "—") return 0;
  // Parentheses = negative
  const neg = /^\(.*\)$/.test(s);
  s = s.replace(/[()$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

function isTotalRow(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return true;
  return (
    n.startsWith("total ") ||
    n === "gross profit" ||
    n === "net operating income" ||
    n === "net income" ||
    n === "net other income" ||
    n.startsWith("net ")
  );
}

function detectHeaderInfo(text: string): { asOfMonth?: number; fiscalYear?: number; fullYear: boolean } {
  const lower = text.toLowerCase();
  let asOfMonth: number | undefined;
  let fiscalYear: number | undefined;
  let fullYear = false;

  // Date range like "January 2026 - April 2026" or "Jan - Apr 2026"
  const yearMatch = lower.match(/\b(20\d{2})\b/g);
  if (yearMatch && yearMatch.length) {
    fiscalYear = Number(yearMatch[yearMatch.length - 1]);
  }

  // Find latest month mentioned
  let lastMonthIdx = -1;
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    const m = MONTH_NAMES[i];
    const re = new RegExp(`\\b${m}\\b|\\b${m.slice(0, 3)}\\b`, "g");
    let match;
    while ((match = re.exec(lower)) !== null) {
      if (match.index > lastMonthIdx) {
        lastMonthIdx = match.index;
        asOfMonth = i + 1;
      }
    }
  }

  // Full year heuristic: mentions January..December, or "fiscal year", or as-of December
  if (
    asOfMonth === 12 ||
    /\bfiscal year\b/.test(lower) ||
    (/\bjanuary\b|\bjan\b/.test(lower) && /\bdecember\b|\bdec\b/.test(lower))
  ) {
    fullYear = true;
  }

  return { asOfMonth, fiscalYear, fullYear };
}

export function parseQboCsv(csvText: string): QboParseResult {
  const parsed = Papa.parse<string[]>(csvText, {
    skipEmptyLines: false,
  });
  const rows = parsed.data as string[][];

  // Top-of-file header text for detection (first ~6 rows joined)
  const headerText = rows.slice(0, 8).map((r) => r.join(" ")).join("\n");
  const { asOfMonth, fiscalYear, fullYear } = detectHeaderInfo(headerText);

  // Find the column header row containing "Actual" / "Budget"
  let headerRow = -1;
  let actualCol = -1;
  let budgetCol = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const r = rows[i] ?? [];
    const lc = r.map((c) => (c ?? "").toString().trim().toLowerCase());
    const aIdx = lc.findIndex((c) => c === "actual" || c === "ytd actual");
    const bIdx = lc.findIndex((c) => c === "budget" || c === "ytd budget");
    if (aIdx !== -1 && bIdx !== -1) {
      headerRow = i;
      actualCol = aIdx;
      budgetCol = bIdx;
      break;
    }
  }

  // Fallback: assume columns 1 (Actual) and 2 (Budget) if header not found
  if (headerRow === -1) {
    actualCol = 1;
    budgetCol = 2;
    headerRow = 0;
  }

  const lines: QboLine[] = [];
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

    const actual = parseNumber(r[actualCol]);
    const budget = parseNumber(r[budgetCol]);

    // Skip rows that have no numeric data at all (likely section headers)
    if (actual === null && budget === null) {
      ignored.push(name);
      continue;
    }

    // Indentation = leading whitespace count
    const indent = rawName.length - rawName.trimStart().length;

    lines.push({
      name,
      ytdActual: actual ?? 0,
      ytdBudget: budget ?? 0,
      indent,
    });
  }

  return { asOfMonth, fiscalYear, fullYear, lines, ignored };
}

// --- Category matching ---

function normalize(s: string): string {
  return s.toLowerCase().replace(/^\d+\s*[-·:]\s*/, "").replace(/\s+/g, " ").trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const v0 = new Array(b.length + 1).fill(0).map((_, i) => i);
  const v1 = new Array(b.length + 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

export type MatchableCategory = { id: string; name: string };

export function matchCategory(
  lineName: string,
  cats: MatchableCategory[],
): MatchableCategory | null {
  const n = normalize(lineName);
  // exact
  for (const c of cats) if (normalize(c.name) === n) return c;
  // substring
  for (const c of cats) {
    const cn = normalize(c.name);
    if (cn.includes(n) || n.includes(cn)) return c;
  }
  // fuzzy ≤2
  let best: { c: MatchableCategory; d: number } | null = null;
  for (const c of cats) {
    const d = levenshtein(n, normalize(c.name));
    if (d <= 2 && (!best || d < best.d)) best = { c, d };
  }
  return best?.c ?? null;
}
