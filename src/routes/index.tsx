import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, ArrowUpRight, CalendarDays, CheckCircle2, Circle } from "lucide-react";

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
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);

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
      .select("id,title,due_date,completed")
      .eq("completed", false)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(8)
      .then(({ data }) => setActions(data ?? []));
  }, []);

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
          <Stat label="Attendance" value="—" hint="vs 4-wk avg" />
          <Stat label="Giving" value="—" hint="last 4 weeks" accent />
          <Stat label="CG Participation" value="—" hint="active members" />
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
            <h2 className="text-lg font-display font-semibold mb-3">Open Action Items</h2>
            {actions.length === 0 ? (
              <EmptyRow message="No open action items. Nice." />
            ) : (
              <ul className="space-y-3">
                {actions.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 text-sm">
                    <Circle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <div className="text-foreground">{a.title}</div>
                      {a.due_date && (
                        <div className="text-xs text-muted-foreground">
                          Due {formatDistanceToNow(new Date(a.due_date), { addSuffix: true })}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
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
            <ReportRow label="Weekly Metrics" status="Not uploaded" />
            <ReportRow label="Monthly Finance" status="Not uploaded" />
          </div>
        </div>
      </div>
    </>
  );
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

function ReportRow({ label, status }: { label: string; status: string }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span>{label}</span>
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        {status} <ArrowUpRight className="w-3 h-3" />
      </span>
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
