import { useEffect, useState } from "react";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { getWorshipTrends, type WorshipTrends, type SectionKey } from "@/lib/sunday-review-trends.functions";
import { cn } from "@/lib/utils";

const LABELS: Record<SectionKey, string> = {
  worship: "Musical worship",
  confession: "Call & confession",
  connect: "Connect moment",
  sermon: "Sermon",
};

export function WorshipTrendStrip() {
  const [data, setData] = useState<WorshipTrends | null>(null);

  useEffect(() => {
    (getWorshipTrends as any)()
      .then((r: WorshipTrends) => setData(r))
      .catch(() => setData(null));
  }, []);

  if (!data) return null;
  const sections: SectionKey[] = ["worship", "confession", "connect", "sermon"];
  const anyData = sections.some((s) => data.sections[s].some((p) => p.rolling_avg != null));
  if (!anyData) return null;

  return (
    <div className="mb-6 bg-surface border border-border rounded-2xl p-4 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-display font-semibold">Worship quality trends</h2>
        <span className="text-[11px] text-muted-foreground">6-review rolling avg · last 6 months</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {sections.map((s) => {
          const curr = data.current[s];
          const delta = data.delta6w[s];
          const points = data.sections[s].filter((p) => p.rolling_avg != null);
          const warn = delta != null && delta <= -0.5;
          return (
            <div
              key={s}
              className={cn(
                "border rounded-xl p-3",
                warn ? "border-warning/40 bg-warning/5" : "border-border bg-background/40",
              )}
            >
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground truncate">{LABELS[s]}</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-display font-bold tabular-nums">
                  {curr != null ? curr.toFixed(1) : "—"}
                </span>
                <DeltaPill delta={delta} />
              </div>
              <Sparkline points={points.map((p) => p.rolling_avg as number)} warn={warn} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeltaPill({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-[11px] text-muted-foreground">no trend</span>;
  if (Math.abs(delta) < 0.1) {
    return (
      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-0.5">
        <Minus className="w-3 h-3" /> flat
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={cn(
        "text-[11px] inline-flex items-center gap-0.5 font-medium",
        up ? "text-success" : "text-destructive",
      )}
    >
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {up ? "+" : ""}
      {delta.toFixed(1)}
    </span>
  );
}

function Sparkline({ points, warn }: { points: number[]; warn: boolean }) {
  if (points.length < 2) return <div className="h-6 mt-2" />;
  const w = 100;
  const h = 24;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = w / (points.length - 1);
  const d = points
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${(h - ((v - min) / range) * h).toFixed(2)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-6 mt-2" preserveAspectRatio="none">
      <path d={d} fill="none" strokeWidth="1.5" className={warn ? "stroke-warning" : "stroke-primary"} />
    </svg>
  );
}
