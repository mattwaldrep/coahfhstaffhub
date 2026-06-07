import { useEffect, useState } from "react";
import { Activity, ChevronDown, ChevronUp, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { getCongregationPulse, type PulseResult } from "@/lib/pulse.functions";
import { cn } from "@/lib/utils";

export function CongregationPulse() {
  const [data, setData] = useState<PulseResult | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (getCongregationPulse as any)()
      .then((r: PulseResult) => setData(r))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const score = data?.score ?? 0;
  const tone = score >= 75 ? "text-success" : score >= 55 ? "text-warning" : "text-destructive";
  const ringTone = score >= 75 ? "stroke-success" : score >= 55 ? "stroke-warning" : "stroke-destructive";

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-display font-semibold flex items-center gap-2">
          <Activity className="w-4 h-4 text-muted-foreground" />
          Congregation Pulse
        </h2>
        {data && data.components.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            {open ? "Hide" : "Breakdown"}
            {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !data || !data.components.length ? (
        <p className="text-sm text-muted-foreground">Not enough data yet to compute a pulse.</p>
      ) : (
        <>
          <div className="flex items-center gap-4">
            <Gauge score={score} ringTone={ringTone} />
            <div className="min-w-0">
              <div className={cn("text-4xl font-display font-bold leading-none", tone)}>{score}</div>
              <div className="text-xs text-muted-foreground mt-1">out of 100</div>
              {data.weakest && (
                <div className="text-xs text-muted-foreground mt-2">
                  Pulling down: <span className="font-medium text-foreground">{data.weakest}</span>
                </div>
              )}
            </div>
          </div>

          {open && (
            <ul className="mt-4 space-y-2 border-t border-border pt-3">
              {data.components.map((c) => (
                <li key={c.key} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c.label}</div>
                    <div className="text-xs text-muted-foreground truncate">{c.detail}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <DirIcon dir={c.direction} />
                    <span className="font-mono text-sm tabular-nums">{c.score}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Gauge({ score, ringTone }: { score: number; ringTone: string }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0">
      <circle cx="36" cy="36" r={r} className="stroke-border" strokeWidth="6" fill="none" />
      <circle
        cx="36"
        cy="36"
        r={r}
        className={ringTone}
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 36 36)"
      />
    </svg>
  );
}

function DirIcon({ dir }: { dir: "up" | "down" | "flat" | null }) {
  if (dir === "up") return <TrendingUp className="w-3.5 h-3.5 text-success" />;
  if (dir === "down") return <TrendingDown className="w-3.5 h-3.5 text-destructive" />;
  if (dir === "flat") return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  return null;
}
