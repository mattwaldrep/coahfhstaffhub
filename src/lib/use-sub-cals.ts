import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listSubCalendars, type SubCalendarRow } from "@/lib/sub-calendars.functions";

/**
 * Shared hook — returns the active sub-calendars for this workspace and
 * quick lookup helpers so any UI that shows sub-calendar labels / colors
 * stays in sync with the settings page. Falls back to legacy keys when
 * a row hasn't been persisted yet.
 */
export function useSubCals() {
  const fetchFn = useServerFn(listSubCalendars);
  const [rows, setRows] = useState<SubCalendarRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchFn()
      .then((r) => {
        if (!cancelled) setRows(r ?? []);
      })
      .catch((e) => console.error("useSubCals", e));
    return () => {
      cancelled = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byKey = useMemo(() => {
    const m = new Map<string, SubCalendarRow>();
    for (const r of rows) m.set(r.key, r);
    return m;
  }, [rows]);

  const active = useMemo(() => rows.filter((r) => r.is_active), [rows]);

  function labelFor(key: string): string {
    const r = byKey.get(key);
    if (r) return r.name;
    // legacy fallback: humanize the key
    return (key ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function colorFor(key: string): string {
    return byKey.get(key)?.color_token ?? "var(--cal-general)";
  }

  return { rows, active, byKey, labelFor, colorFor };
}
