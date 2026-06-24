/**
 * Event readiness scoring. Pure functions, no IO.
 *
 * Now split into two independent scores:
 *   - PLANNING & LOGISTICS: leader/teacher, room, childcare, non-comms checklist
 *   - COMMUNICATIONS: comms-channel checklist items only
 *
 * Class events (sub_calendar === "classes") planning weights:
 *   teacher (50) + childcare arranged (25) + room (25)
 * General events planning weights:
 *   leader (40) + room (30) + logistics checklist (30)
 */

export type ReadinessEvent = {
  category?: string | null;
  leader_name?: string | null;
  leader_id?: string | null;
  childcare_needed?: boolean | null;
  childcare_arranged?: boolean | null;
  room_needed?: string | null;
  has_room?: boolean;
  room_not_needed?: boolean | null;
  leader_not_needed?: boolean | null;
  /** Logistics (non-comms) checklist counts. */
  checklist_total?: number;
  checklist_done?: number;
  /** Communications checklist counts (comms-channel tasks). */
  comms_total?: number;
  comms_done?: number;
};

export interface ReadinessResult {
  score: number; // 0-100
  level: "ready" | "warning" | "critical";
  missing: string[];
}

export interface SplitReadiness {
  planning: ReadinessResult;
  comms: ReadinessResult;
}

const teacherFrom = (e: ReadinessEvent) => (e.leader_name ?? "").trim().length > 0 || !!e.leader_id;

function hasRoom(e: ReadinessEvent) {
  if (typeof e.has_room === "boolean") return e.has_room;
  return (e.room_needed ?? "").trim().length > 0;
}

function levelFor(score: number): ReadinessResult["level"] {
  return score >= 90 ? "ready" : score >= 60 ? "warning" : "critical";
}

export function scorePlanning(e: ReadinessEvent): ReadinessResult {
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
      if (done < total) missing.push(`Logistics (${done}/${total})`);
    }
  }

  return { score: Math.min(100, score), level: levelFor(score), missing };
}

export function scoreComms(e: ReadinessEvent): ReadinessResult {
  const total = e.comms_total ?? 0;
  const done = e.comms_done ?? 0;
  if (total === 0) {
    return { score: 100, level: "ready", missing: [] };
  }
  const score = Math.round((done / total) * 100);
  const missing = done < total ? [`Comms (${done}/${total})`] : [];
  return { score, level: levelFor(score), missing };
}

/** Split readiness — preferred entry point. */
export function scoreEventSplit(e: ReadinessEvent): SplitReadiness {
  return { planning: scorePlanning(e), comms: scoreComms(e) };
}

/** Back-compat: returns planning readiness only. */
export function scoreEvent(e: ReadinessEvent): ReadinessResult {
  return scorePlanning(e);
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

/** Set of checklist labels that count as communications (comms-channel tasks). */
export const COMMS_CHECKLIST_LABELS = new Set<string>([
  "Set up PCO registration",
  "List on Eventbrite",
  "List on Google",
  "List on community calendars",
  "Post on socials",
  "Run social ads",
  "Send direct email",
  "Send push notification",
  "Add to Sunday slides",
  "Add to Sunday announcements",
  "Feature as Ministry Highlight",
  "Include in newsletter",
  "Send text message",
]);

export function isCommsLabel(label: string | null | undefined): boolean {
  return !!label && COMMS_CHECKLIST_LABELS.has(label.trim());
}
