import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { fetchWeeksInRange, type WeeklyMetric } from "@/integrations/metrics/client";

export const Route = createFileRoute("/trends")({ component: TrendsPage });

type Series = {
  key: keyof WeeklyMetric;
  label: string;
  group: "attendance" | "giving" | "engagement";
  fmt?: (n: number) => string;
};

const SERIES: Series[] = [
  { key: "total_attendance", label: "Total attendance", group: "attendance" },
  { key: "sanctuary_attendance", label: "Sanctuary", group: "attendance" },
  { key: "kids_attendance", label: "Kids", group: "attendance" },
  { key: "community_group_attendance", label: "Community groups", group: "attendance" },
  { key: "internal_giving", label: "Internal giving", group: "giving", fmt: (n) => `$${Math.round(n).toLocaleString()}` },
  { key: "first_step_cards", label: "First-step cards", group: "engagement" },
  { key: "next_step_cards", label: "Next-step cards", group: "engagement" },
  { key: "prayer_count", label: "Prayer interactions", group: "engagement" },
  { key: "volunteers_added", label: "Volunteers added", group: "engagement" },
];

const RANGES = [
  { id: "13w", label: "13 weeks", weeks: 13 },
  { id: "26w", label: "26 weeks", weeks: 26 },
  { id: "52w", label: "12 months", weeks: 52 },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function avg(xs: Array<number | null | undefined>) {
  const v = xs.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function pctDelta(a: number | null, b: number | null) {
  if (a == null || b == null || b === 0) return null;
  return ((a - b) / b) * 100;
}

function fmtNum(n: number) {
  return Math.round(n).toLocaleString();
}

function DeltaBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const up = value >= 0;
  return (
    <span className={cn("font-mono text-xs", up ? "text-emerald-600" : "text-destructive")}>
      {up ? "▲" : "▼"} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function TrendsPage() {
  const [allRows, setAllRows] = useState<WeeklyMetric[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rangeId, setRangeId] = useState<RangeId>("13w");
  const [selectedKey, setSelectedKey] = useState<keyof WeeklyMetric>("total_attendance");

  useEffect(() => {
    // Fetch a wider window so YoY comparison is always possible
    const end = new Date();
    const start = new Date(end);
    start.setMonth(start.getMonth() - 18);
    fetchWeeksInRange(ymd(start), ymd(end))
      .then((r) => setAllRows([...r].sort((a, b) => a.week_start_date.localeCompare(b.week_start_date))))
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load metrics"));
  }, []);

  const range = RANGES.find((r) => r.id === rangeId)!;
  const selected = SERIES.find((s) => s.key === selectedKey)!;

  const inRange = useMemo(() => {
    if (!allRows) return [];
    return allRows.slice(-range.weeks);
  }, [allRows, range.weeks]);

  const yoyRange = useMemo(() => {
    if (!allRows || allRows.length < range.weeks + 52) return [];
    const end = allRows.length - 52;
    const start = Math.max(0, end - range.weeks);
    return allRows.slice(start, end);
  }, [allRows, range.weeks]);

  const chartData = useMemo(() => {
    return inRange.map((r, i) => ({
      date: r.week_start_date.slice(5),
      value: (r[selectedKey] as number | null) ?? null,
      yoy: (yoyRange[i]?.[selectedKey] as number | null) ?? null,
    }));
  }, [inRange, yoyRange, selectedKey]);

  const fmt = selected.fmt ?? fmtNum;

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold">Trends</h1>
            <p className="text-sm text-muted-foreground">
              {selected.label} over the last {range.label.toLowerCase()}.
            </p>
          </div>
          <div className="flex gap-1 rounded-md border bg-card p-0.5">
            {RANGES.map((r) => (
              <Button
                key={r.id}
                size="sm"
                variant={rangeId === r.id ? "default" : "ghost"}
                className="h-7 px-2 text-xs"
                onClick={() => setRangeId(r.id)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </header>

        {err ? (
          <EmptyState icon={TrendingUp} title="Couldn't load metrics" description={err} />
        ) : allRows === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : inRange.length === 0 ? (
          <EmptyState icon={TrendingUp} title="No metrics in range" description="Nothing logged in this window yet." />
        ) : (
          <>
            <HeadlineChart
              label={selected.label}
              data={chartData}
              fmt={fmt}
              hasYoy={yoyRange.length > 0}
            />

            <KpiGrid
              rows={inRange}
              yoyRows={yoyRange}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}

function HeadlineChart({
  label,
  data,
  fmt,
  hasYoy,
}: {
  label: string;
  data: Array<{ date: string; value: number | null; yoy: number | null }>;
  fmt: (n: number) => string;
  hasYoy: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{label}</CardTitle>
          {hasYoy && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 rounded-sm bg-primary" />
                This year
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 rounded-sm bg-muted-foreground/40" />
                Prior year
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="h-72 pt-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 2" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={28} />
            <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={(v) => fmt(v as number)} />
            <Tooltip
              contentStyle={{ fontSize: 12, padding: 8, borderRadius: 8 }}
              formatter={(v: number, name) => [fmt(v), name === "yoy" ? "Prior year" : "This year"]}
            />
            {hasYoy && (
              <Line
                type="monotone"
                dataKey="yoy"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                connectNulls
              />
            )}
            <Area
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              fill="url(#trendFill)"
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function KpiGrid({
  rows,
  yoyRows,
  selectedKey,
  onSelect,
}: {
  rows: WeeklyMetric[];
  yoyRows: WeeklyMetric[];
  selectedKey: keyof WeeklyMetric;
  onSelect: (k: keyof WeeklyMetric) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {SERIES.map((s) => {
        const values = rows.map((r) => r[s.key] as number | null);
        const latest = [...values].reverse().find((v) => v != null) ?? null;
        const periodAvg = avg(values);
        const prevAvg = avg(yoyRows.map((r) => r[s.key] as number | null));
        const yoy = pctDelta(periodAvg, prevAvg);

        // WoW: last value vs prior value
        const lastTwo = values.filter((v) => v != null).slice(-2) as number[];
        const wow = lastTwo.length === 2 ? pctDelta(lastTwo[1], lastTwo[0]) : null;

        const fmt = s.fmt ?? fmtNum;
        const active = selectedKey === s.key;

        return (
          <button
            key={String(s.key)}
            onClick={() => onSelect(s.key)}
            className={cn(
              "text-left rounded-lg border bg-card p-3 transition-colors hover:border-primary/60",
              active && "border-primary ring-1 ring-primary",
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.group}</span>
            </div>
            <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums">
              {latest != null ? fmt(latest) : "—"}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Avg <span className="font-mono">{periodAvg != null ? fmt(periodAvg) : "—"}</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">WoW</span>
                <DeltaBadge value={wow} />
              </div>
            </div>
            <div className="mt-1 flex items-center justify-end gap-2 text-xs">
              <span className="text-muted-foreground">YoY</span>
              <DeltaBadge value={yoy} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
