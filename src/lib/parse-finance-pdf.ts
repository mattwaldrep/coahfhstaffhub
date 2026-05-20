// Client-side parser for finance "Statement of Activity by Month" PDFs (Parable
// management reports & similar). Uses pdfjs to extract positioned text, then
// aligns numeric tokens to month columns by X-coordinate.

export type ParsedFinanceRow = {
  /** Raw line label, e.g. "4000 Tithes & Offering" */
  name: string;
  /** Optional GL account prefix detected from the name */
  account?: string;
  /** Cleaned-up name with the account prefix removed */
  displayName: string;
  /** Section the row belongs to (Revenue / Expenditures / Other) */
  section: "revenue" | "expenditures" | "other" | "unknown";
  /** Map of month number (1-12) → amount. Months without a value are omitted. */
  monthly: Record<number, number>;
  /** Total across the row, if printed. */
  total?: number;
};

export type ParsedFinanceReport = {
  /** Detected fiscal year (calendar year of the last column). */
  fiscalYear?: number;
  /** Sorted month numbers (1-12) that have data. */
  months: number[];
  /** Parsed line items. */
  rows: ParsedFinanceRow[];
  /** Rows we deliberately skipped (totals/subtotals/blank) for transparency. */
  ignored: { name: string; reason: string }[];
  /** First page of raw text, for debugging. */
  rawSample: string;
};

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const SECTION_HEADERS: Array<{ re: RegExp; section: ParsedFinanceRow["section"] }> = [
  { re: /^revenue$/i, section: "revenue" },
  { re: /^expenditures?$/i, section: "expenditures" },
  { re: /^other revenue$/i, section: "other" },
  { re: /^other expenditures?$/i, section: "other" },
];

const SKIP_PATTERNS = [
  /^total\b/i,
  /^gross profit/i,
  /^net (operating |other )?(revenue|loss|income)/i,
  /^uncategorized/i,
  /^statement of/i,
  /^budget vs/i,
  /^city on a hill/i,
  /^prepared (by|on)/i,
  /^management report/i,
  /^table of contents/i,
  /^page \d+/i,
  /^for the period/i,
];

function parseNumber(s: string): number | null {
  // Handles "1,234.56", "(1,234.56)" (negative), "—" / "-" (blank)
  const t = s.trim();
  if (!t || t === "—" || t === "-" || t === "–") return null;
  const neg = /^\(.+\)$/.test(t);
  const cleaned = t.replace(/[(),$\s]/g, "").replace(/[–—]/g, "-");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
}

type PositionedToken = { x: number; y: number; str: string };

async function extractTokens(file: File | Blob): Promise<PositionedToken[][]> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?worker&url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;

  const pages: PositionedToken[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const tokens: PositionedToken[] = [];
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      const s = item.str;
      if (!s || !s.trim()) continue;
      tokens.push({ x: item.transform[4], y: Math.round(item.transform[5]), str: s });
    }
    pages.push(tokens);
  }
  return pages;
}

function groupRows(tokens: PositionedToken[]): PositionedToken[][] {
  const byY = new Map<number, PositionedToken[]>();
  for (const t of tokens) {
    const arr = byY.get(t.y) ?? [];
    arr.push(t);
    byY.set(t.y, arr);
  }
  const ys = Array.from(byY.keys()).sort((a, b) => b - a);
  return ys.map((y) => byY.get(y)!.sort((a, b) => a.x - b.x));
}

/**
 * Find the header row that contains "Jul 2025 Aug 2025 ... Total" (or similar).
 * Returns the column centers (x positions) for each month plus the year detected.
 */
function findMonthHeader(rows: PositionedToken[][]): {
  rowIndex: number;
  columns: Array<{ month: number; x: number }>;
  totalX: number | null;
  fiscalYear: number | null;
} | null {
  const monthRe = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cols: Array<{ month: number; x: number; year: number }> = [];
    let totalX: number | null = null;
    let j = 0;
    while (j < row.length) {
      const tok = row[j];
      const m = tok.str.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/i);
      if (m) {
        const monthIdx = MONTH_NAMES.findIndex((n) => n.toLowerCase() === m[1].slice(0, 3).toLowerCase()) + 1;
        cols.push({ month: monthIdx, x: tok.x, year: Number(m[2]) });
        j++;
        continue;
      }
      // Some PDFs split "Jul" and "2025" into separate tokens
      if (monthRe.test(tok.str) && j + 1 < row.length && /^\d{4}$/.test(row[j + 1].str)) {
        const monthIdx = MONTH_NAMES.findIndex((n) => n.toLowerCase() === tok.str.slice(0, 3).toLowerCase()) + 1;
        cols.push({ month: monthIdx, x: tok.x, year: Number(row[j + 1].str) });
        j += 2;
        continue;
      }
      if (/^total$/i.test(tok.str)) {
        totalX = tok.x;
      }
      j++;
    }
    if (cols.length >= 3) {
      const fiscalYear = cols[cols.length - 1].year;
      return {
        rowIndex: i,
        columns: cols.map((c) => ({ month: c.month, x: c.x })),
        totalX,
        fiscalYear,
      };
    }
  }
  return null;
}

function classifyName(name: string): ParsedFinanceRow["section"] | null {
  for (const { re, section } of SECTION_HEADERS) {
    if (re.test(name.trim())) return section;
  }
  return null;
}

function shouldSkip(name: string): string | null {
  const t = name.trim();
  if (!t) return "blank";
  for (const re of SKIP_PATTERNS) if (re.test(t)) return "section/total";
  return null;
}

function splitLineIntoLabelAndNumbers(row: PositionedToken[]): {
  labelTokens: PositionedToken[];
  numberTokens: PositionedToken[];
} {
  const labelTokens: PositionedToken[] = [];
  const numberTokens: PositionedToken[] = [];
  for (const t of row) {
    // Treat anything that parses to a number (or is a dash placeholder) as a numeric col
    const isNum = parseNumber(t.str) !== null;
    if (isNum && labelTokens.length > 0) {
      numberTokens.push(t);
    } else {
      labelTokens.push(t);
    }
  }
  return { labelTokens, numberTokens };
}

function assignNumbersToColumns(
  numberTokens: PositionedToken[],
  columns: Array<{ month: number; x: number }>,
  totalX: number | null,
): { monthly: Record<number, number>; total?: number } {
  const monthly: Record<number, number> = {};
  let total: number | undefined;
  // For each number token, snap to the nearest column center within a tolerance.
  const allTargets: Array<{ kind: "month" | "total"; month?: number; x: number }> = [
    ...columns.map((c) => ({ kind: "month" as const, month: c.month, x: c.x })),
    ...(totalX != null ? [{ kind: "total" as const, x: totalX }] : []),
  ];
  for (const tok of numberTokens) {
    const v = parseNumber(tok.str);
    if (v === null) continue;
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < allTargets.length; i++) {
      const d = Math.abs(allTargets[i].x - tok.x);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (bestIdx === -1 || bestDist > 60) continue; // 60pt tolerance
    const target = allTargets[bestIdx];
    if (target.kind === "month" && target.month != null) {
      monthly[target.month] = v;
    } else {
      total = v;
    }
  }
  return { monthly, total };
}

const ACCOUNT_PREFIX_RE = /^(\d{3,6})\s+(.+)$/;

export async function parseFinancePdf(file: File | Blob): Promise<ParsedFinanceReport> {
  const pages = await extractTokens(file);
  const ignored: ParsedFinanceReport["ignored"] = [];
  const rows: ParsedFinanceRow[] = [];
  let fiscalYear: number | undefined;
  const monthsSeen = new Set<number>();
  let rawSample = "";

  let currentSection: ParsedFinanceRow["section"] = "unknown";

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const grouped = groupRows(pages[pageIdx]);
    if (!rawSample) {
      rawSample = grouped.slice(0, 30).map((r) => r.map((t) => t.str).join(" ")).join("\n");
    }
    const header = findMonthHeader(grouped);
    if (!header) continue;
    if (fiscalYear == null && header.fiscalYear != null) fiscalYear = header.fiscalYear;
    for (const c of header.columns) monthsSeen.add(c.month);

    for (let i = header.rowIndex + 1; i < grouped.length; i++) {
      const row = grouped[i];
      const { labelTokens, numberTokens } = splitLineIntoLabelAndNumbers(row);
      const name = labelTokens.map((t) => t.str).join(" ").replace(/\s+/g, " ").trim();
      if (!name) continue;

      const sectionMatch = classifyName(name);
      if (sectionMatch && numberTokens.length === 0) {
        currentSection = sectionMatch;
        continue;
      }

      const skipReason = shouldSkip(name);
      if (skipReason) {
        ignored.push({ name, reason: skipReason });
        continue;
      }

      if (numberTokens.length === 0) {
        // Probably a heading without numbers — skip silently
        continue;
      }

      const { monthly, total } = assignNumbersToColumns(numberTokens, header.columns, header.totalX);
      if (Object.keys(monthly).length === 0 && total == null) {
        ignored.push({ name, reason: "no values mapped" });
        continue;
      }

      const accountMatch = name.match(ACCOUNT_PREFIX_RE);
      rows.push({
        name,
        account: accountMatch?.[1],
        displayName: accountMatch ? accountMatch[2] : name,
        section: currentSection,
        monthly,
        total,
      });
    }
  }

  // Deduplicate rows by displayName — the same category may appear on multiple
  // pages of the "by Month" report; we keep the row with the most month values.
  const dedup = new Map<string, ParsedFinanceRow>();
  for (const r of rows) {
    const key = r.displayName.toLowerCase();
    const existing = dedup.get(key);
    if (!existing || Object.keys(r.monthly).length > Object.keys(existing.monthly).length) {
      dedup.set(key, r);
    }
  }

  return {
    fiscalYear,
    months: Array.from(monthsSeen).sort((a, b) => a - b),
    rows: Array.from(dedup.values()),
    ignored,
    rawSample,
  };
}

/** Normalize a category name for matching. */
export function normalizeCategoryName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^\d{3,6}\s+/, "") // strip GL account prefix
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp: number[] = Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

export type CategoryRef = { id: string; name: string };

export function matchCategory(
  row: ParsedFinanceRow,
  categories: CategoryRef[],
): { categoryId: string; confidence: "exact" | "substring" | "fuzzy" } | null {
  const target = normalizeCategoryName(row.displayName);
  if (!target) return null;
  const normalized = categories.map((c) => ({ ...c, norm: normalizeCategoryName(c.name) }));

  for (const c of normalized) if (c.norm === target) return { categoryId: c.id, confidence: "exact" };
  for (const c of normalized) {
    if (!c.norm) continue;
    if (c.norm.includes(target) || target.includes(c.norm)) {
      return { categoryId: c.id, confidence: "substring" };
    }
  }
  let best: { id: string; dist: number } | null = null;
  for (const c of normalized) {
    const d = editDistance(c.norm, target);
    if (d <= 2 && (!best || d < best.dist)) best = { id: c.id, dist: d };
  }
  if (best) return { categoryId: best.id, confidence: "fuzzy" };
  return null;
}
