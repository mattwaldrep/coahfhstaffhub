import { RRule } from "rrule";
import { format } from "date-fns";

export type EventRowLike = {
  id: string;
  title: string;
  start_at: string;
  end_at: string | null;
  sub_calendar: string;
  leader_name: string | null;
  category: string | null;
  all_day: boolean;
  rrule: string | null;
  excluded_dates: string[] | null;
};

export type Occurrence<T extends EventRowLike = EventRowLike> = T & {
  occurrence_date: Date;
};

export function expandEvents<T extends EventRowLike>(
  events: T[],
  rangeStart: Date,
  rangeEnd: Date,
): Occurrence<T>[] {
  const out: Occurrence<T>[] = [];
  for (const e of events) {
    const start = new Date(e.start_at);
    if (!e.rrule) {
      if (start >= rangeStart && start <= rangeEnd) {
        out.push({ ...e, occurrence_date: start });
      }
      continue;
    }
    try {
      const rule = RRule.fromString(e.rrule);
      const dates = rule.between(rangeStart, rangeEnd, true);
      const skip = new Set(e.excluded_dates ?? []);
      for (const d of dates) {
        const iso = format(d, "yyyy-MM-dd");
        if (skip.has(iso)) continue;
        out.push({ ...e, occurrence_date: d });
      }
    } catch {
      if (start >= rangeStart && start <= rangeEnd) {
        out.push({ ...e, occurrence_date: start });
      }
    }
  }
  return out.sort((a, b) => a.occurrence_date.getTime() - b.occurrence_date.getTime());
}
