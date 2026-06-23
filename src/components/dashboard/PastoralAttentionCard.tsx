import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Heart, ArrowUpRight } from "lucide-react";
import { getPastoralGaps, type PastoralGap } from "@/lib/pastoral-gaps.functions";
import { getMyElderName } from "@/lib/pastoral-care.functions";

export function PastoralAttentionCard() {
  const [gaps, setGaps] = useState<PastoralGap[] | null>(null);
  const [myName, setMyName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<"mine" | "all">("mine");

  useEffect(() => {
    Promise.all([
      (getPastoralGaps as any)().then((r: any) => r?.gaps ?? []).catch(() => []),
      (getMyElderName as any)().then((r: any) => r?.full_name ?? null).catch(() => null),
    ])
      .then(([g, n]) => {
        setGaps(g);
        setMyName(n);
        if (!n) setScope("all");
      })
      .finally(() => setLoading(false));
  }, []);

  const all = gaps ?? [];
  const filtered =
    scope === "mine" && myName
      ? all.filter((g) => (g.assigned_elder ?? "").trim().toLowerCase() === myName.toLowerCase())
      : all;

  const reds = filtered
    .filter((g) => g.level === "red")
    .sort((a, b) => {
      if (a.days_since === null) return -1;
      if (b.days_since === null) return 1;
      return b.days_since - a.days_since;
    });
  const ambers = filtered.filter((g) => g.level === "amber");

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
      {myName && (
        <div className="flex items-center gap-1 mb-3 text-[11px]">
          <button
            type="button"
            onClick={() => setScope("mine")}
            className={`px-2 py-0.5 rounded-full transition ${scope === "mine" ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}
          >
            My people
          </button>
          <button
            type="button"
            onClick={() => setScope("all")}
            className={`px-2 py-0.5 rounded-full transition ${scope === "all" ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}
          >
            All
          </button>
        </div>
      )}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : reds.length === 0 && ambers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {scope === "mine" ? "No one assigned to you needs attention right now. 🎉" : "Everyone's been contacted in the last 45 days. 🎉"}
        </p>
      ) : (
        <>
          {reds.length > 0 && (
            <ul className="space-y-2 mb-2">
              {reds.slice(0, 5).map((g) => (
                <li key={g.pco_person_id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{g.name}</div>
                    {scope === "all" && g.assigned_elder && (
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
          {ambers.length > 0 && (
            <div className="text-xs text-amber-600 border-t border-border pt-2 mt-2">
              {ambers.length} approaching the 60-day threshold
            </div>
          )}
        </>
      )}
    </div>
  );
}
