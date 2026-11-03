import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { meetingDateRanges } from "./meeting-date-ranges";

const date = (value: Date) => format(value, "yyyy-MM-dd HH:mm");

describe("selected staff meeting date windows", () => {
  it("shows the previous seven days for a past meeting", () => {
    const range = meetingDateRanges("2026-10-21");
    expect(date(range.previousStart)).toBe("2026-10-14 00:00");
    expect(date(range.previousEnd)).toBe("2026-10-21 00:00");
  });

  it("starts the 90-day upcoming window at a future meeting", () => {
    const range = meetingDateRanges("2026-11-11");
    expect(date(range.upcomingStart)).toBe("2026-11-11 00:00");
    expect(date(range.upcomingEnd)).toBe("2027-02-09 00:00");
  });

  it("selects the Sunday preceding the meeting, including the existing date tolerance", () => {
    const range = meetingDateRanges("2026-10-21");
    expect(range.sundayDate).toBe("2026-10-18");
    expect(range.reviewStart).toBe("2026-10-17");
    expect(range.reviewEnd).toBe("2026-10-24");
  });

  it("uses calendar-day arithmetic across November daylight saving", () => {
    const range = meetingDateRanges("2026-11-04");
    expect(date(range.previousStart)).toBe("2026-10-28 00:00");
    expect(date(range.previousEnd)).toBe("2026-11-04 00:00");
    expect(range.sundayDate).toBe("2026-11-01");
  });
});