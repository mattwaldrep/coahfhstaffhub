/**
 * Conflict detection for calendar events. Pure function — no IO.
 *
 * Two events conflict when their time intervals overlap AND
 *  - they share at least one room_id, OR
 *  - they have the same leader (matched by leader_id, or by case-insensitive leader_name when no id).
 *
 * All-day events are treated as covering their full date.
 */

export type ConflictEvent = {
  id: string;
  title: string;
  start_at: string; // ISO
  end_at?: string | null;
  all_day?: boolean | null;
  leader_id?: string | null;
  leader_name?: string | null;
  room_ids?: string[]; // ids of rooms assigned via event_rooms
};

function toRange(e: ConflictEvent): [number, number] {
  const start = new Date(e.start_at).getTime();
  if (e.all_day) {
    const day = new Date(e.start_at);
    const startOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
    return [startOfDay, startOfDay + 24 * 3600_000];
  }
  const end = e.end_at ? new Date(e.end_at).getTime() : start + 60 * 60_000;
  return [start, end];
}

function overlaps(a: ConflictEvent, b: ConflictEvent) {
  const [aS, aE] = toRange(a);
  const [bS, bE] = toRange(b);
  return aS < bE && bS < aE;
}

function sharedLeader(a: ConflictEvent, b: ConflictEvent) {
  if (a.leader_id && b.leader_id && a.leader_id === b.leader_id) return true;
  const an = (a.leader_name ?? "").trim().toLowerCase();
  const bn = (b.leader_name ?? "").trim().toLowerCase();
  return !!an && an === bn;
}

function sharedRoom(a: ConflictEvent, b: ConflictEvent) {
  const ra = a.room_ids ?? [];
  const rb = new Set(b.room_ids ?? []);
  return ra.some((id) => rb.has(id));
}

export type Conflict = {
  other: ConflictEvent;
  reason: "room" | "leader" | "both";
};

/** Find conflicts for `candidate` against `existing` (excluding itself by id). */
export function findConflicts(
  candidate: ConflictEvent,
  existing: ConflictEvent[],
): Conflict[] {
  const out: Conflict[] = [];
  for (const ev of existing) {
    if (ev.id === candidate.id) continue;
    if (!overlaps(candidate, ev)) continue;
    const room = sharedRoom(candidate, ev);
    const leader = sharedLeader(candidate, ev);
    if (!room && !leader) continue;
    out.push({ other: ev, reason: room && leader ? "both" : room ? "room" : "leader" });
  }
  return out;
}
