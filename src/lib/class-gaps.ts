export type ClassGapInput = {
  category?: string | null;
  leader_name?: string | null;
  childcare_needed?: boolean | null;
  childcare_arranged?: boolean | null;
};

/**
 * Returns a list of human-readable missing requirements for an event
 * categorized as "Class". Empty array means no attention needed.
 */
export function classGaps(e: ClassGapInput): string[] {
  if (e.category !== "Class") return [];
  const gaps: string[] = [];
  if (!e.leader_name) gaps.push("teacher");
  if (e.childcare_needed && !e.childcare_arranged) gaps.push("childcare arrangement");
  return gaps;
}
