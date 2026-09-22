import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { listElderMeetings } from "@/lib/elder.functions";
import { listCareList } from "@/lib/pastoral-care.functions";
import { CalendarDays, HeartHandshake, ScrollText, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/elder/")({
  component: ElderOverview,
});

// Health tags come from Planning Center. The first two tags PCO lists are
// treated as "doing well"; anything after that needs attention, ranked by order.
const WELL_COUNT = 2;


type CarePerson = {
  id: string;
  name: string;
  fields: Record<string, { datum_id: string; value: string | null }>;
};

function ElderOverview() {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<any[]>([]);
  const [care, setCare] = useState<CarePerson[]>([]);
  const [careFields, setCareFields] = useState<{ assigned_elder: string; spiritual_health: string } | null>(null);
  const [myName, setMyName] = useState<string>("");
  const [healthOptions, setHealthOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      listElderMeetings(),
      listCareList({ data: {} }),
      user
        ? supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])
      .then(([m, c, prof]: any[]) => {
        setMeetings(m as any[]);
        setCare(((c?.people ?? []) as CarePerson[]));
        setCareFields(c?.fields ?? null);
        setHealthOptions(Array.isArray(c?.health_options) ? (c.health_options as string[]) : []);
        setMyName((prof?.data?.full_name ?? "").trim());
      })
      .catch(() => { /* surfaced elsewhere */ })
      .finally(() => setLoading(false));
  }, [user]);

  const myList = useMemo(() => {
    if (!careFields || !myName) return [] as CarePerson[];
    const me = myName.toLowerCase();
    return care.filter((p) => {
      const v = (p.fields[careFields.assigned_elder]?.value ?? "").trim().toLowerCase();
      return v === me;
    });
  }, [care, careFields, myName]);

  const urgent = useMemo(() => {
    if (!careFields) return [] as CarePerson[];
    const rank = (h: string) => healthOptions.indexOf(h);
    return care
      .map((p) => ({ p, h: (p.fields[careFields.spiritual_health]?.value ?? "").trim() }))
      .filter(({ h }) => h && rank(h) >= WELL_COUNT)
      .sort((a, b) => rank(b.h) - rank(a.h) || a.p.name.localeCompare(b.p.name))
      .map(({ p }) => p);
  }, [care, careFields, healthOptions]);

  const toneFor = (h: string) => {
    const i = healthOptions.indexOf(h);
    if (i < 0 || healthOptions.length <= WELL_COUNT) return "watch" as const;
    const ratio = (i - WELL_COUNT) / Math.max(1, healthOptions.length - 1 - WELL_COUNT);
    return ratio >= 0.66 ? ("crisis" as const) : ratio >= 0.33 ? ("warn" as const) : ("watch" as const);
  };


  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const upcoming = meetings.filter((m) => new Date(m.meeting_date) >= new Date()).slice(0, 3);
  const recent = meetings.filter((m) => new Date(m.meeting_date) < new Date()).slice(0, 3);

  const healthOf = (p: CarePerson) =>
    (careFields ? (p.fields[careFields.spiritual_health]?.value ?? "") : "") || "No tag";


  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card title="Upcoming meetings" icon={CalendarDays} cta={{ to: "/elder/meetings", label: "All meetings" }}>
        {upcoming.length === 0 && <Empty text="Nothing scheduled." />}
        {upcoming.map((m) => (
          <Row key={m.id} to={`/elder/meetings/${m.id}`} title={m.title ?? "Elder Meeting"} sub={format(new Date(m.meeting_date), "EEE, MMM d")} tag={m.meeting_type === "joint" ? "Joint" : undefined} />
        ))}
      </Card>

      <Card
        title="My care list"
        icon={HeartHandshake}
        cta={{ to: "/elder/pastoral-care", label: "Open list" }}
        subtitle={myName ? `Assigned to ${myName}` : "Set your profile name to see assignments"}
      >
        {myList.length === 0 && (
          <Empty text={myName ? "No one is currently assigned to you." : "No assignments to show."} />
        )}
        {myList.slice(0, 6).map((p) => (
          <Row key={p.id} to="/elder/pastoral-care" title={p.name} sub={healthOf(p)} />
        ))}
      </Card>

      <Card
        title="Needs attention"
        icon={AlertTriangle}
        cta={{ to: "/elder/pastoral-care", label: "Open list" }}
        subtitle="Flagged by their Planning Center health tag"
      >
        {urgent.length === 0 && <Empty text="No one flagged right now." />}
        {urgent.slice(0, 6).map((p) => {
          const h = healthOf(p);
          const elder = careFields ? (p.fields[careFields.assigned_elder]?.value ?? "").trim() : "";
          return (
            <Row
              key={p.id}
              to="/elder/pastoral-care"
              title={p.name}
              sub={elder ? `${h} · ${elder}` : `${h} · unassigned`}
              tag={h}
              tagTone={toneFor(h)}

            />
          );
        })}
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

function Card({ title, icon: Icon, cta, children, subtitle }: any) {
  return (
    <div className="bg-surface border border-border rounded-2xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Icon className="w-4 h-4 text-[oklch(0.55_0.15_280)]" />
            {title}
          </div>
          {subtitle && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtitle}</div>}
        </div>
        {cta && (
          <Link to={cta.to} className="text-xs text-muted-foreground hover:text-foreground shrink-0">
            {cta.label} →
          </Link>
        )}
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function Row({ to, title, sub, tag, tagTone }: any) {
  const toneClass =
    tagTone === "crisis"
      ? "bg-[oklch(0.65_0.2_25)]/15 text-[oklch(0.55_0.2_25)]"
      : tagTone === "warn"
      ? "bg-[oklch(0.75_0.15_60)]/15 text-[oklch(0.5_0.15_60)]"
      : tagTone === "watch"
      ? "bg-[oklch(0.7_0.12_90)]/15 text-[oklch(0.45_0.12_90)]"
      : "bg-[oklch(0.55_0.15_280)]/15 text-[oklch(0.55_0.15_280)]";
  return (
    <Link to={to} className="flex items-center justify-between px-4 py-3 hover:bg-background/40">
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{title}</div>
        <div className="text-xs text-muted-foreground truncate">{sub}</div>
      </div>
      {tag && (
        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded shrink-0 ${toneClass}`}>
          {tag}
        </span>
      )}
    </Link>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="px-4 py-6 text-sm text-muted-foreground">{text}</div>;
}
