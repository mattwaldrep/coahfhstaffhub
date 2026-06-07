import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Heart, ArrowUpRight } from "lucide-react";
import { getPastoralGaps, type PastoralGap } from "@/lib/pastoral-gaps.functions";

export function PastoralAttentionCard() {
  const [gaps, setGaps] = useState<PastoralGap[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (getPastoralGaps as any)()
      .then((r: any) => setGaps(r?.gaps ?? []))
      .catch(() => setGaps([]))
      .finally(() => setLoading(false));
  }, []);

  const reds = (gaps ?? [])
    .filter((g) => g.level === "red")
    .sort((a, b) => {
      if (a.days_since === null) return -1;
      if (b.days_since === null) return 1;
      return b.days_since - a.days_since;
    })
    .slice(0, 5);

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-display font-semibold flex items-center gap-2">
          <Heart className="w-4 h-4 text-destructive" /> Pastoral attention
        </h2>
        <Link
          to="/elder/pastoral-care"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          Open <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : reds.length === 0 ? (
        <p className="text-sm text-muted-foreground">Everyone's been contacted in the last 60 days. 🎉</p>
      ) : (
        <ul className="space-y-2">
          {reds.map((g) => (
            <li key={g.pco_person_id} className="flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium truncate">{g.name}</div>
                {g.assigned_elder && (
                  <div className="text-xs text-muted-foreground truncate">Assigned: {g.assigned_elder}</div>
                )}
              </div>
              <span className="text-xs text-destructive font-medium shrink-0">
                {g.days_since === null ? "Never" : `${g.days_since}d`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
