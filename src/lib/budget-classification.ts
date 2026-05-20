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

const BRIDGE_RE = /^\s*4501\b/i;
const DESIGNATED_RE = /(^\s*9500\b)|(CP\s+Expense)|(Designated\s+Expense)/i;

export function inferClassification(
  name: string,
  kind: "income" | "expense",
): BudgetClassification {
  if (BRIDGE_RE.test(name)) return "bridge_income";
  if (kind === "income") return "operating_income";
  if (DESIGNATED_RE.test(name)) return "designated_expense";
  return "operating_expense";
}
