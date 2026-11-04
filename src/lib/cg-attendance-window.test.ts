import { describe, it, expect } from "vitest";
import { cgAttendanceWindow, chicagoDate } from "./cg-attendance-window";

describe("cgAttendanceWindow", () => {
  it("Wednesday meeting uses the previous Sunday–Saturday", () => {
    expect(cgAttendanceWindow("2026-11-04")).toEqual({ start: "2026-10-25", end: "2026-10-31" });
  });
  it("on a Sunday, uses the week that just ended", () => {
    expect(cgAttendanceWindow("2026-11-01")).toEqual({ start: "2026-10-25", end: "2026-10-31" });
  });
  it("on a Saturday, the current week is not yet complete", () => {
    expect(cgAttendanceWindow("2026-10-31")).toEqual({ start: "2026-10-18", end: "2026-10-24" });
  });
  it("evening Central events keep their local date", () => {
    expect(chicagoDate("2026-11-01T02:30:00Z")).toBe("2026-10-31");
  });
});
