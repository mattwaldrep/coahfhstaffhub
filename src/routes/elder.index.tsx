import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { listElderMeetings } from "@/server/elder.functions";
import { listCareList } from "@/server/pastoral-care.functions";
import { CalendarDays, HeartHandshake, ScrollText } from "lucide-react";

export const Route = createFileRoute("/elder/")({
  component: ElderOverview,
});

function ElderOverview() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [care, setCare] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listElderMeetings(), listCareList({ data: {} })])
      .then(([m, c]: any[]) => { setMeetings(m as any[]); setCare((c?.people ?? []) as any[]); })
      .catch(() => { /* surfaced elsewhere */ })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const upcoming = meetings.filter((m) => new Date(m.meeting_date) >= new Date()).slice(0, 3);
  const recent = meetings.filter((m) => new Date(m.meeting_date) < new Date()).slice(0, 3);
  const topCare = care.slice(0, 5);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card title="Upcoming meetings" icon={CalendarDays} cta={{ to: "/elder/meetings", label: "All meetings" }}>
        {upcoming.length === 0 && <Empty text="Nothing scheduled." />}
        {upcoming.map((m) => (
          <Row key={m.id} to={`/elder/meetings/${m.id}`} title={m.title ?? "Elder Meeting"} sub={format(new Date(m.meeting_date), "EEE, MMM d")} tag={m.meeting_type === "joint" ? "Joint" : undefined} />
        ))}
      </Card>

      <Card title="Pastoral care" icon={HeartHandshake} cta={{ to: "/elder/pastoral-care", label: "Open list" }}>
        {topCare.length === 0 && <Empty text="No people on the care list." />}
        {topCare.map((p) => (
          <Row key={p.id} to="/elder/pastoral-care" title={p.name} sub="View details" />
        ))}
      </Card>

      <Card title="Recent meetings" icon={ScrollText} cta={{ to: "/elder/meetings", label: "History" }}>
        {recent.length === 0 && <Empty text="No past meetings yet." />}
        {recent.map((m) => (
          <Row key={m.id} to={`/elder/meetings/${m.id}`} title={m.title ?? "Elder Meeting"} sub={format(new Date(m.meeting_date), "MMM d, yyyy")} />
        ))}
      </Card>
    </div>
  );
}

function Card({ title, icon: Icon, cta, children }: any) {
  return (
    <div className="bg-surface border border-border rounded-2xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="w-4 h-4 text-[oklch(0.55_0.15_280)]" />
          {title}
        </div>
        {cta && (
          <Link to={cta.to} className="text-xs text-muted-foreground hover:text-foreground">
            {cta.label} →
          </Link>
        )}
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function Row({ to, title, sub, tag }: any) {
  return (
    <Link to={to} className="flex items-center justify-between px-4 py-3 hover:bg-background/40">
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{title}</div>
        <div className="text-xs text-muted-foreground truncate capitalize">{sub}</div>
      </div>
      {tag && (
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[oklch(0.55_0.15_280)]/15 text-[oklch(0.55_0.15_280)]">
          {tag}
        </span>
      )}
    </Link>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="px-4 py-6 text-sm text-muted-foreground">{text}</div>;
}
