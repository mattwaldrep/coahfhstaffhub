import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, ArrowUpRight, CalendarDays, CheckCircle2, Circle, AlertCircle, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchRecentWeeks, summarizeWeeks, type MetricsHeadline } from "@/integrations/metrics/client";
import { useMetricsSession } from "@/integrations/metrics/use-session";
import { expandEvents, type EventRowLike } from "@/lib/calendar-expand";
import { classGaps } from "@/lib/class-gaps";
import { InlineClassFixer } from "@/components/inline/InlineClassFixer";
import { EmptyState } from "@/components/ui/empty-state";

import { CongregationPulse } from "@/components/dashboard/CongregationPulse";
import { PastoralAttentionCard } from "@/components/dashboard/PastoralAttentionCard";
import { TaskSourceButton } from "@/components/tasks/TaskSourceButton";
import { GoogleTasksCard } from "@/components/dashboard/GoogleTasksCard";

export const Route = createFileRoute("/")({
  component: HomePage,
});

interface CalendarEvent {
  id: string;
  title: string;
  start_at: string;
  sub_calendar: string;
  readiness: "green" | "yellow" | "red" | null;
}
interface ActionItem {
  id: string;
  title: string;
  due_date: string | null;
  completed: boolean;
  assignee_id: string | null;
}

const SUB_CAL_LABEL: Record<string, string> = {
  forest_hills_main: "Forest Hills",
  coah_lm: "COAH:LM",
  youth: "Youth",
  general: "General",
};
const SUB_CAL_VAR: Record<string, string> = {
  forest_hills_main: "var(--cal-main)",
  coah_lm: "var(--cal-lm)",
  youth: "var(--cal-youth)",
  general: "var(--cal-general)",
};

function HomePage() {
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}

function Dashboard() {
  const { user, hasElderAccess } = useAuth();
  const metricsSession = useMetricsSession();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [classAlerts, setClassAlerts] = useState<Array<{ id: string; title: string; date: Date; gaps: string[]; leader_name: string | null; leader_not_needed: boolean; childcare_needed: boolean; childcare_arranged: boolean }>>([]);
  const [alertsTick, setAlertsTick] = useState(0);
  const [activeMissions, setActiveMissions] = useState(0);
  const [upcomingMissions, setUpcomingMissions] = useState(0);
  const [headline, setHeadline] = useState<MetricsHeadline | null>(null);
  const [prevHeadline, setPrevHeadline] = useState<MetricsHeadline | null>(null);
  const [statsRange, setStatsRange] = useState<string | null>(null);
  const [metricsErr, setMetricsErr] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date().toISOString();
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString();
    supabase
      .from("calendar_events")
      .select("id,title,start_at,sub_calendar,readiness")
      .gte("start_at", now)
      .lte("start_at", in7)
      .order("start_at", { ascending: true })
      .then(({ data }) => setEvents(data ?? []));
    supabase
      .from("action_items")
      .select("id,title,due_date,completed,assignee_id")
      .eq("completed", false)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(50)
      .then(({ data }) => setActions((data ?? []) as ActionItem[]));

    // Upcoming class events needing teacher or childcare arrangement
    const horizonEnd = new Date(Date.now() + 60 * 86400000);
    supabase
      .from("calendar_events")
      .select("id,title,start_at,end_at,sub_calendar,leader_name,category,all_day,rrule,excluded_dates,leader_not_needed,childcare_needed,childcare_arranged")
      .eq("category", "Class")
      .or(`start_at.gte.${new Date().toISOString()},rrule.not.is.null`)
      .then(({ data }) => {
        const rows = (data ?? []) as Array<EventRowLike & { leader_not_needed: boolean; childcare_needed: boolean; childcare_arranged: boolean }>;
        const occurrences = expandEvents(rows, new Date(), horizonEnd);
        const alerts = occurrences
          .map((o) => ({
            id: o.id,
            title: o.title,
            date: o.occurrence_date,
            gaps: classGaps(o),
            leader_name: o.leader_name ?? null,
            leader_not_needed: (o as { leader_not_needed?: boolean }).leader_not_needed ?? false,
            childcare_needed: (o as { childcare_needed?: boolean }).childcare_needed ?? false,
            childcare_arranged: (o as { childcare_arranged?: boolean }).childcare_arranged ?? false,
          }))
          .filter((a) => a.gaps.length > 0)
          .slice(0, 8);
        setClassAlerts(alerts);
      });
  }, [alertsTick]);

  // Live metrics from Church Metrics — last 4 weeks vs preceding 4 weeks
  useEffect(() => {
    if (!metricsSession) {
      setHeadline(null);
      setPrevHeadline(null);
      setStatsRange(null);
      return;
    }
    setMetricsErr(null);
    fetchRecentWeeks(2)
      .then((rows) => {
        const latest = rows.slice(0, 1);
        const prev = rows.slice(1, 2);
        setHeadline(latest.length ? summarizeWeeks(latest) : null);
        setPrevHeadline(prev.length ? summarizeWeeks(prev) : null);
        if (latest.length) {
          setStatsRange(`Week of ${format(new Date(latest[0].week_start_date + "T12:00"), "MMM d")}`);
        } else {
          setStatsRange(null);
        }
      })
      .catch((e) => setMetricsErr(e.message ?? "Failed to load metrics"));
  }, [metricsSession]);


  const todayStr = format(new Date(), "yyyy-MM-dd");
  const myActions = user ? actions.filter((a) => a.assignee_id === user.id).slice(0, 8) : [];
  const overdueAll = actions.filter((a) => a.due_date && a.due_date < todayStr);

  const today = format(new Date(), "EEEE, MMM d");
  const greeting = (user?.email ?? "").split("@")[0];

  return (
    <>
      <div className="mb-10">
        <h1 className="text-4xl font-display font-bold tracking-tight">{today}</h1>
        <p className="text-muted-foreground mt-2">
          Welcome back{greeting ? `, ${greeting}` : ""}. Here's where the church stands.
        </p>
      </div>

      

      <div className="grid grid-cols-12 gap-6">
        {/* KPI cards */}
        <div className="col-span-12 lg:col-span-8 self-start grid grid-cols-2 lg:grid-cols-4 auto-rows-min gap-4">
          <Stat
            label="Attendance"
            value={fmtNum(headline?.avg_total_attendance)}
            hint={deltaHint(headline?.avg_total_attendance, prevHeadline?.avg_total_attendance, statsRange ?? "latest week")}
          />
          <Stat
            label="Giving"
            value={fmtMoney(headline?.avg_weekly_giving)}
            hint={deltaHint(headline?.avg_weekly_giving, prevHeadline?.avg_weekly_giving, statsRange ?? "latest week")}
            accent
          />
          <Stat
            label="CG Participation"
            value={fmtNum(headline?.avg_community_groups)}
            hint={deltaHint(headline?.avg_community_groups, prevHeadline?.avg_community_groups, statsRange ?? "latest week")}
          />
          <Stat label="Active Missions" value="0" hint="teams deployed" />

          <div className="col-span-2 lg:col-span-4 bg-surface border border-border rounded-2xl p-6 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-display font-semibold flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-muted-foreground" /> Next 7 days
              </h2>
              <span className="text-xs text-muted-foreground">{events.length} scheduled</span>
            </div>
            {events.length === 0 ? (
              <EmptyRow message="No upcoming events. Add one from the Calendar." />
            ) : (
              <ul className="divide-y divide-border">
                {events.map((e) => (
                  <li key={e.id}>
                    <Link
                      to="/calendar"
                      search={{ event: e.id }}
                      className="py-3 flex items-center justify-between gap-4 hover:bg-background/40 rounded-md px-2 -mx-2"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: SUB_CAL_VAR[e.sub_calendar] }}
                        />
                        <span className="font-medium truncate">{e.title}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          · {SUB_CAL_LABEL[e.sub_calendar]}
                        </span>
                        {e.readiness && <ReadinessDot r={e.readiness} />}
                      </div>
                      <div className="text-sm text-muted-foreground shrink-0">
                        {format(new Date(e.start_at), "EEE p")}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-display font-semibold">My Action Items</h2>
              {overdueAll.length > 0 && (
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-destructive/15 text-destructive font-semibold inline-flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {overdueAll.length} overdue
                </span>
              )}
            </div>
            {myActions.length === 0 ? (
              <EmptyRow message="Nothing assigned to you. Nice." />
            ) : (
              <ul className="space-y-3">
                {myActions.map((a) => {
                  const overdue = a.due_date && a.due_date < todayStr;
                  const toggle = async () => {
                    setActions((prev) => prev.filter((x) => x.id !== a.id));
                    const { error } = await supabase
                      .from("action_items")
                      .update({ completed: true })
                      .eq("id", a.id);
                    if (error) {
                      setActions((prev) => [...prev, a]);
                    }
                  };
                  return (
                    <li key={a.id} className="flex items-start gap-3 text-sm">
                      <button
                        type="button"
                        onClick={toggle}
                        aria-label="Mark complete"
                        className="mt-0.5 shrink-0 rounded-full hover:text-primary transition-colors"
                      >
                        <Circle className={cn("w-4 h-4", overdue ? "text-destructive" : "text-muted-foreground")} />
                      </button>
                      <div className="flex-1">
                        <div className="text-foreground flex items-center gap-1.5">
                          <span>{a.title}</span>
                          <TaskSourceButton actionItemId={a.id} />
                        </div>
                        {a.due_date && (
                          <div className={cn("text-xs", overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                            Due {formatDistanceToNow(new Date(a.due_date), { addSuffix: true })}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link to="/meeting" className="text-xs text-muted-foreground hover:text-foreground mt-3 inline-flex items-center gap-1">
              View all in Meeting <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          <GoogleTasksCard />

          <div className="bg-surface border border-border rounded-2xl p-6 shadow-card">
            <h2 className="text-lg font-display font-semibold mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" /> Alerts
            </h2>
            {classAlerts.length === 0 ? (
              <EmptyState
                compact
                title="All clear"
                description="No classes are missing a teacher or childcare in the next 60 days."
              />
            ) : (
              <ul className="space-y-2">
                {classAlerts.map((a) => (
                  <li key={`${a.id}-${a.date.toISOString()}`} className="text-sm flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{a.title}</div>
                      <InlineClassFixer
                        event={{
                          id: a.id,
                          title: a.title,
                          leader_name: a.leader_name,
                          leader_not_needed: a.leader_not_needed,
                          childcare_needed: a.childcare_needed,
                          childcare_arranged: a.childcare_arranged,
                        }}
                        gaps={a.gaps}
                        onSaved={() => setAlertsTick((t) => t + 1)}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0 pt-0.5">
                      {format(a.date, "EEE, MMM d")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>


          <CongregationPulse />
          {hasElderAccess && <PastoralAttentionCard />}
          <MetricsStatusCard connected={!!metricsSession} error={metricsErr} weeks={headline?.weeks ?? 0} />
        </div>
      </div>
    </>
  );
}

function fmtNum(n?: number) {
  if (n === undefined || n === null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}
function fmtMoney(n?: number) {
  if (n === undefined || n === null || !Number.isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}
function deltaHint(curr?: number, prev?: number, fallback = "") {
  if (curr === undefined || prev === undefined || !prev) return fallback;
  const pct = ((curr - prev) / prev) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}% vs prev week`;
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-5 shadow-card">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-3 text-3xl font-display font-bold ${accent ? "text-primary" : ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{hint}</div>
    </div>
  );
}

function ReadinessDot({ r }: { r: "green" | "yellow" | "red" }) {
  const color = r === "green" ? "bg-success" : r === "yellow" ? "bg-warning" : "bg-destructive";
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color} ml-1`} />;
}

function MetricsStatusCard({ connected, error, weeks }: { connected: boolean; error: string | null; weeks: number }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-6 shadow-card">
      <h2 className="text-lg font-display font-semibold mb-3">Church Metrics</h2>
      {connected ? (
        error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Live · {weeks} week{weeks === 1 ? "" : "s"} loaded.{" "}
            <a href="https://churchmetrics.lovable.app/" target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-0.5">
              Open <ArrowUpRight className="w-3 h-3" />
            </a>
          </p>
        )
      ) : (
        <p className="text-sm text-muted-foreground">
          Not connected.{" "}
          <Link to="/settings" className="underline">Connect in Settings</Link> to see live attendance and giving here.
        </p>
      )}
    </div>
  );
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
      <CheckCircle2 className="w-4 h-4" /> {message}
    </div>
  );
}
