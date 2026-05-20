// Church fiscal year runs July 1 – June 30.
// Convention: a fiscal year is named by the calendar year it ENDS in.
// e.g. Jul 2025 – Jun 2026 = FY 2026.

export const FY_START_MONTH = 7; // July

/** Returns the fiscal year that contains the given (calendar) year + month. */
export function fiscalYearOf(year: number, month: number): number {
  return month >= FY_START_MONTH ? year + 1 : year;
}

/** 1..12 position of a calendar month within the fiscal year. July=1, June=12. */
export function fiscalMonthIndex(month: number): number {
  return ((month - FY_START_MONTH + 12) % 12) + 1;
}

/** Current fiscal year based on today. */
export function currentFiscalYear(d: Date = new Date()): number {
  return fiscalYearOf(d.getFullYear(), d.getMonth() + 1);
}

/** Human label, e.g. "FY 2026 (Jul 2025 – Jun 2026)" */
export function fiscalYearLabel(fy: number): string {
  return `FY ${fy}`;
}
export function fiscalYearRangeLabel(fy: number): string {
  return `Jul ${fy - 1} – Jun ${fy}`;
}
