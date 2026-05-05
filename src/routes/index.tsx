import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, ArrowUpRight, CalendarDays, CheckCircle2, Circle, AlertCircle, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchRecentWeeks, summarizeWeeks, type MetricsHeadline } from "@/integrations/metrics/client";
import { useMetricsSession } from "@/integrations/metrics/use-session";

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

type Headline = {
  avg_total_attendance?: number;
  avg_weekly_giving?: number;
  avg_community_groups?: number;
};

function Dashboard() {
  const { user } = useAuth();
  const metricsSession = useMetricsSession();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
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
  }, []);

  // Live metrics from Church Metrics — last 4 weeks vs preceding 4 weeks
  useEffect(() => {
    if (!metricsSession) {
      setHeadline(null);
      setPrevHeadline(null);
      setStatsRange(null);
      return;
    }
    setMetricsErr(null);
    fetchRecentWeeks(8)
      .then((rows) => {
        const recent = rows.slice(0, 4);
        const prior = rows.slice(4, 8);
        setHeadline(recent.length ? summarizeWeeks(recent) : null);
        setPrevHeadline(prior.length ? summarizeWeeks(prior) : null);
        if (recent.length) {
          const start = recent[recent.length - 1].week_start_date;
          const end = recent[0].week_start_date;
          setStatsRange(`${format(new Date(start + "T12:00"), "MMM d")} – ${format(new Date(end + "T12:00"), "MMM d")}`);
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
        <div className="col-span-12 lg:col-span-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat
            label="Attendance"
            value={fmtNum(headline?.avg_total_attendance)}
            hint={deltaHint(headline?.avg_total_attendance, prevHeadline?.avg_total_attendance, "vs prev period")}
          />
          <Stat
            label="Giving"
            value={fmtMoney(headline?.avg_weekly_giving)}
            hint={deltaHint(headline?.avg_weekly_giving, prevHeadline?.avg_weekly_giving, "avg / week")}
            accent
          />
          <Stat
            label="CG Participation"
            value={fmtNum(headline?.avg_community_groups)}
            hint={deltaHint(headline?.avg_community_groups, prevHeadline?.avg_community_groups, "avg groups")}
          />
          <Stat label="Active Missions" value="0" hint={statsRange ?? "teams deployed"} />

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
                  <li key={e.id} className="py-3 flex items-center justify-between gap-4">
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
                  return (
                    <li key={a.id} className="flex items-start gap-3 text-sm">
                      <Circle className={cn("w-4 h-4 mt-0.5 shrink-0", overdue ? "text-destructive" : "text-muted-foreground")} />
                      <div className="flex-1">
                        <div className="text-foreground">{a.title}</div>
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

          <div className="bg-surface border border-border rounded-2xl p-6 shadow-card">
            <h2 className="text-lg font-display font-semibold mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" /> Alerts
            </h2>
            <p className="text-sm text-muted-foreground">
              No active alerts. Event readiness and missions risk will surface here.
            </p>
          </div>

          <div className="bg-surface border border-border rounded-2xl p-6 shadow-card">
            <h2 className="text-lg font-display font-semibold mb-3">Reports</h2>
            <ReportRow label="Weekly Metrics" reportType="trends" />
            <ReportRow label="Monthly Finance" reportType="finance" />
          </div>
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
  return `${sign}${pct.toFixed(1)}% vs prev`;
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

function ReportRow({ label, reportType }: { label: string; reportType: "trends" | "finance" }) {
  const { user } = useAuth();
  const [latest, setLatest] = useState<{ id: string; file_path: string; file_name: string; created_at: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const now = new Date();
    const { data } = await supabase
      .from("finance_reports")
      .select("id,file_path,file_name,created_at")
      .eq("report_type", reportType)
      .eq("fiscal_year", now.getFullYear())
      .eq("month", now.getMonth() + 1)
      .order("created_at", { ascending: false })
      .limit(1);
    setLatest((data?.[0] as any) ?? null);
  }, [reportType]);

  useEffect(() => { load(); }, [load]);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const now = new Date();
      const fy = now.getFullYear();
      const month = now.getMonth() + 1;
      const ext = file.name.split(".").pop();
      const folder = reportType === "trends" ? "trends/" : "";
      const path = `${folder}${fy}/${String(month).padStart(2, "0")}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("finance-reports").upload(path, file);
      if (upErr) throw upErr;

      let parsed: unknown = null;
      if (reportType === "trends" && (/pdf/i.test(file.type) || /\.pdf$/i.test(file.name))) {
        try { parsed = await parseMetricsPdf(file); } catch (e) { console.warn(e); }
      }

      const { error } = await supabase.from("finance_reports").insert({
        fiscal_year: fy,
        month,
        label: `${label} — ${format(now, "MMM d, yyyy")}`,
        file_path: path,
        file_name: file.name,
        mime_type: file.type,
        uploaded_by: user?.id,
        report_type: reportType,
        parsed_metrics: parsed as never,
      });
      if (error) throw error;
      toast.success(`${label} uploaded`);
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function open() {
    if (!latest) return;
    const { data, error } = await supabase.storage
      .from("finance-reports")
      .createSignedUrl(latest.file_path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  }

  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span>{label}</span>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.csv,.xlsx,.xls,application/pdf"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      {latest ? (
        <button
          type="button"
          onClick={open}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          title={latest.file_name}
        >
          <FileText className="w-3 h-3" /> {format(new Date(latest.created_at), "MMM d")}
          <ArrowUpRight className="w-3 h-3" />
        </button>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 disabled:opacity-60"
        >
          {uploading ? (
            <><Loader2 className="w-3 h-3 animate-spin" /> Uploading…</>
          ) : (
            <>Not uploaded <Upload className="w-3 h-3" /></>
          )}
        </button>
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
