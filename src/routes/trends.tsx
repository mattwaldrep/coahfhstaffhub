import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TrendingUp } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
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
  fmt?: (n: number) => string;
};

const SERIES: Series[] = [
  { key: "total_attendance", label: "Total attendance" },
  { key: "sanctuary_attendance", label: "Sanctuary" },
  { key: "kids_attendance", label: "Kids" },
  { key: "community_group_attendance", label: "Community groups" },
  { key: "internal_giving", label: "Internal giving", fmt: (n) => `$${Math.round(n).toLocaleString()}` },
  { key: "first_step_cards", label: "First-step cards" },
  { key: "next_step_cards", label: "Next-step cards" },
  { key: "prayer_count", label: "Prayer interactions" },
  { key: "volunteers_added", label: "Volunteers added" },
];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function avg(xs: Array<number | null | undefined>) {
  const v = xs.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function TrendCard({ series, rows }: { series: Series; rows: WeeklyMetric[] }) {
  const data = useMemo(
    () => rows.map((r) => ({
      date: r.week_start_date.slice(5),
      value: (r[series.key] as number | null) ?? null,
    })),
    [rows, series.key],
  );

  // YoY: compare last 4 weeks to same 4 weeks 1 year prior
  const yoy = useMemo(() => {
    if (rows.length < 8) return null;
    const recent = rows.slice(-4).map((r) => r[series.key] as number | null);
    const yearAgoStart = Math.max(0, rows.length - 52 - 4);
    const yearAgo = rows.slice(yearAgoStart, yearAgoStart + 4).map((r) => r[series.key] as number | null);
    const a = avg(recent), b = avg(yearAgo);
    if (a == null || b == null || b === 0) return null;
    return ((a - b) / b) * 100;
  }, [rows, series.key]);

  const latest = data[data.length - 1]?.value ?? null;
  const fmt = series.fmt ?? ((n: number) => Math.round(n).toLocaleString());

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle className="text-sm font-medium">{series.label}</CardTitle>
          <div className="flex items-center gap-2 text-xs">
            {latest != null && <span className="font-mono">{fmt(latest)}</span>}
            {yoy != null && (
              <span className={yoy >= 0 ? "text-emerald-600" : "text-destructive"}>
                {yoy >= 0 ? "▲" : "▼"} {Math.abs(yoy).toFixed(1)}% YoY
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="h-32 pt-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 2" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={28} />
            <YAxis tick={{ fontSize: 10 }} width={32} />
            <Tooltip
              contentStyle={{ fontSize: 12, padding: 6 }}
              formatter={(v: number) => fmt(v)}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function TrendsPage() {
  const [rows, setRows] = useState<WeeklyMetric[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const end = new Date();
    const start = new Date(end);
    start.setMonth(start.getMonth() - 12);
    fetchWeeksInRange(ymd(start), ymd(end))
      .then((r) => setRows([...r].sort((a, b) => a.week_start_date.localeCompare(b.week_start_date))))
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load metrics"));
  }, []);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-display font-bold">Trends</h1>
          <p className="text-sm text-muted-foreground">Rolling 12 months. Pulled from the church metrics app.</p>
        </header>

        {err ? (
          <EmptyState icon={TrendingUp} title="Couldn't load metrics" description={err} />
        ) : rows === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={TrendingUp} title="No metrics in range" description="The metrics app has nothing for the last 12 months." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {SERIES.map((s) => <TrendCard key={String(s.key)} series={s} rows={rows} />)}
          </div>
        )}
      </div>
    </AppShell>
  );
}
