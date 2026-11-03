import { addDays, format, parseISO, startOfDay, subDays } from "date-fns";

// Meeting dates are local calendar dates, not UTC timestamps.
export function meetingDateRanges(meetingDate: string) {
  const anchor = startOfDay(parseISO(meetingDate));
  const sunday = subDays(anchor, anchor.getDay());
  return {
    previousStart: subDays(anchor, 7),
    previousEnd: anchor,
    upcomingStart: anchor,
    upcomingEnd: addDays(anchor, 90),
    sundayDate: format(sunday, "yyyy-MM-dd"),
    reviewStart: format(subDays(sunday, 1), "yyyy-MM-dd"),
    reviewEnd: format(addDays(sunday, 6), "yyyy-MM-dd"),
  };
}