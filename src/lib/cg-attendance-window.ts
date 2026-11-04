/**
 * The CG attendance window is the most recent fully completed Sunday–Saturday
 * week before the reference date (America/Chicago calendar days).
 */
function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function cgAttendanceWindow(refIso: string): { start: string; end: string } {
  const dow = new Date(refIso + "T12:00:00Z").getUTCDay(); // 0 = Sunday
  const end = addDaysIso(refIso, -(dow + 1)); // last Saturday strictly before ref week
  return { start: addDaysIso(end, -6), end };
}

/** Calendar date (YYYY-MM-DD) of an instant in America/Chicago. */
export function chicagoDate(instant: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}
