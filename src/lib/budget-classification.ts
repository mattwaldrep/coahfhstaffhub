// Classification of a budget line into one of four layers used by the finance
// dashboard. Splits operational money from fund-raised church-planting money
// so the dashboard can show Core Local Margin, Net Operating Income, and
// Total Org Cash Flow separately.

export type BudgetClassification =
  | "operating_income"
  | "bridge_income"
  | "operating_expense"
  | "designated_expense";

export const CLASSIFICATION_LABEL: Record<BudgetClassification, string> = {
  operating_income: "Operating income",
  bridge_income: "Bridge income (restricted release)",
  operating_expense: "Operating expense",
  designated_expense: "Designated expense (fund-raised)",
};

export type BudgetKind = "income" | "expense";

const ACCOUNT_CODE_RE = /^\s*(\d{4,6})\b/;
const BRIDGE_RE = /^\s*4501\b/i;
const DESIGNATED_RE = /(^\s*9500\b)|(CP\s+Expense)|(Designated\s+Expense)/i;

export function extractAccountCode(name: string): string | null {
  return name.match(ACCOUNT_CODE_RE)?.[1] ?? null;
}

export function isBelowTheLineAccountCode(accountCode: string | null): boolean {
  return accountCode != null && Number(accountCode) >= 9000;
}

export function isRollupAccountCode(accountCode: string | null): boolean {
  return accountCode != null && Number(accountCode) >= 5000 && /00$/.test(accountCode) && accountCode !== "4501";
}

export function inferKindFromAccountCode(
  accountCode: string | null,
  fallback: BudgetKind,
): BudgetKind {
  if (!accountCode) return fallback;
  const value = Number(accountCode);
  if (value >= 4000 && value < 5000) return "income";
  if (value >= 5000) return "expense";
  return fallback;
}

export function inferClassification(
  name: string,
  kind: BudgetKind,
): BudgetClassification {
  if (BRIDGE_RE.test(name)) return "bridge_income";
  if (kind === "income") return "operating_income";
  if (DESIGNATED_RE.test(name)) return "designated_expense";
  return "operating_expense";
}

export function getBudgetLineMeta(name: string, fallbackKind: BudgetKind) {
  const accountCode = extractAccountCode(name);
  const kind = inferKindFromAccountCode(accountCode, fallbackKind);
  const classification = inferClassification(name, kind);
  return {
    accountCode,
    kind,
    classification,
    isRollup: isRollupAccountCode(accountCode),
    isBelowTheLine: classification === "designated_expense" || isBelowTheLineAccountCode(accountCode),
  };
}
