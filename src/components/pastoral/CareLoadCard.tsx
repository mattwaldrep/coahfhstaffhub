import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { listCareList } from "@/lib/pastoral-care.functions";

type Person = {
  id: string;
  name: string;
  fields: Record<string, { datum_id: string; value: string | null }>;
};

export function CareLoadCard({ compact = false }: { compact?: boolean }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [fields, setFields] = useState<{ assigned_elder: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (listCareList as any)({ data: {} })
      .then((r: any) => {
        if (r?.configured) {
          setFields(r.fields);
          setPeople(r.people ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const { rows, avg, unassigned } = useMemo(() => {
    if (!fields) return { rows: [] as Array<{ elder: string; count: number }>, avg: 0, unassigned: 0 };
    const counts = new Map<string, number>();
    let un = 0;
    for (const p of people) {
      const v = (p.fields[fields.assigned_elder]?.value ?? "").trim();
      if (!v) {
        un++;
        continue;
      }
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const arr = Array.from(counts.entries())
      .map(([elder, count]) => ({ elder, count }))
      .sort((a, b) => b.count - a.count);
    const a = arr.length ? arr.reduce((s, r) => s + r.count, 0) / arr.length : 0;
    return { rows: arr, avg: a, unassigned: un };
  }, [people, fields]);

  if (loading) return null;
  if (!fields || rows.length === 0) return null;

  const max = Math.max(...rows.map((r) => r.count), 1);

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <h2 className={`font-display font-semibold flex items-center gap-2 ${compact ? "text-base" : "text-lg"}`}>
          <Users className="w-4 h-4 text-muted-foreground" /> Care load
        </h2>
        <div className="text-xs text-muted-foreground">
          Avg <span className="font-medium text-foreground">{avg.toFixed(1)}</span> / elder
          {unassigned > 0 && (
            <>
              {" · "}
              <span className="text-amber-600 font-medium">{unassigned} unassigned</span>
            </>
          )}
        </div>
      </div>
      <ul className="space-y-2">
        {rows.map((r) => {
          const pct = (r.count / max) * 100;
          const overloaded = avg > 0 && r.count > avg * 1.2;
          const under = avg > 0 && r.count < avg * 0.6;
          const tone = overloaded
            ? "bg-destructive/70"
            : under
              ? "bg-amber-500/70"
              : "bg-primary/60";
          return (
            <li key={r.elder} className="text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate min-w-0">{r.elder}</span>
                <span className={`text-xs shrink-0 ${overloaded ? "text-destructive font-medium" : under ? "text-amber-600" : "text-muted-foreground"}`}>
                  {r.count}
                  {overloaded && " · overloaded"}
                  {under && " · light"}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-border overflow-hidden">
                <div className={`h-full ${tone} transition-all`} style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
