/**
 * Mission trip readiness score (0-100). Pure functions, no IO.
 *
 * Focus: itinerary & travel.
 *   - Travel dates locked (start + end) — 25
 *   - Itinerary doc exists (doc_url || file_path || link) — 25
 *   - Itinerary owner + due date set — 20
 *   - Lodging confirmed — 15
 *   - Transport confirmed — 15
 */

export type ReadinessTrip = {
  start_date?: string | null;
  end_date?: string | null;
  itinerary_doc_url?: string | null;
  itinerary_file_path?: string | null;
  itinerary_link?: string | null;
  itinerary_owner?: string | null;
  itinerary_due_date?: string | null;
  lodging_status?: string | null;
  transport_status?: string | null;
};

export interface TripReadiness {
  score: number;
  level: "ready" | "warning" | "critical";
  missing: string[];
}

const isConfirmed = (s?: string | null) => {
  const v = (s ?? "").toLowerCase().trim();
  return v === "confirmed" || v === "booked" || v === "done";
};

export function scoreTrip(t: ReadinessTrip): TripReadiness {
  const missing: string[] = [];
  let score = 0;

  if (t.start_date && t.end_date) score += 25;
  else missing.push("Travel dates");

  if (t.itinerary_doc_url || t.itinerary_file_path || t.itinerary_link) score += 25;
  else missing.push("Itinerary doc");

  if ((t.itinerary_owner ?? "").trim() && t.itinerary_due_date) score += 20;
  else missing.push("Itinerary owner & due date");

  if (isConfirmed(t.lodging_status)) score += 15;
  else missing.push("Lodging confirmed");

  if (isConfirmed(t.transport_status)) score += 15;
  else missing.push("Transport confirmed");

  const level: TripReadiness["level"] =
    score >= 85 ? "ready" : score >= 55 ? "warning" : "critical";

  return { score: Math.min(100, score), level, missing };
}

export function readinessTone(level: TripReadiness["level"]) {
  switch (level) {
    case "ready":
      return "text-emerald-600";
    case "warning":
      return "text-amber-600";
    case "critical":
      return "text-destructive";
  }
}
