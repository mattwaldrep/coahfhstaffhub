/**
 * Event readiness scoring. Pure functions, no IO.
 *
 * Class events (sub_calendar === "classes"):
 *   teacher (25) + childcare arranged (25) + room (25) + leader (25)
 * General events:
 *   leader (40) + room (30) + checklist all done (30)
 */

export type ReadinessEvent = {
  category?: string | null; // "Class" → class scoring
  leader_name?: string | null;
  leader_id?: string | null;
  childcare_needed?: boolean | null;
  childcare_arranged?: boolean | null;
  room_needed?: string | null;
  has_room?: boolean; // computed: room assigned via event_rooms OR room_needed text filled
  room_not_needed?: boolean | null;
  leader_not_needed?: boolean | null;
  checklist_total?: number;
  checklist_done?: number;
};

export interface ReadinessResult {
  score: number; // 0-100
  level: "ready" | "warning" | "critical";
  missing: string[];
}

const teacherFrom = (e: ReadinessEvent) => (e.leader_name ?? "").trim().length > 0 || !!e.leader_id;

function hasRoom(e: ReadinessEvent) {
  if (typeof e.has_room === "boolean") return e.has_room;
  return (e.room_needed ?? "").trim().length > 0;
}

export function scoreEvent(e: ReadinessEvent): ReadinessResult {
  const isClass = e.category === "Class";
  const missing: string[] = [];
  let score = 0;
  const leaderSkip = !!e.leader_not_needed;
  const roomSkip = !!e.room_not_needed;

  if (isClass) {
    if (leaderSkip || teacherFrom(e)) score += 50;
    else missing.push("Teacher");

    if (!e.childcare_needed || e.childcare_arranged) score += 25;
    else missing.push("Childcare");

    if (roomSkip || hasRoom(e)) score += 25;
    else missing.push("Room");
  } else {
    // General events: leader (40) + room (30) + checklist (30).
    if (leaderSkip || teacherFrom(e)) score += 40;
    else missing.push("Leader");

    if (roomSkip || hasRoom(e)) score += 30;
    else missing.push("Room");

    const total = e.checklist_total ?? 0;
    const done = e.checklist_done ?? 0;
    if (total === 0) {
      score += 30;
    } else {
      score += Math.round((done / total) * 30);
      if (done < total) missing.push(`Checklist (${done}/${total})`);
    }
  }

  const level: ReadinessResult["level"] =
    score >= 90 ? "ready" : score >= 60 ? "warning" : "critical";

  return { score: Math.min(100, score), level, missing };
}

export function readinessColor(level: ReadinessResult["level"]) {
  switch (level) {
    case "ready":
      return "text-emerald-600";
    case "warning":
      return "text-amber-600";
    case "critical":
      return "text-destructive";
  }
}
