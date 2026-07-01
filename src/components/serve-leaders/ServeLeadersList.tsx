import { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  MessageSquare, RefreshCw, Search, Trash2, Link as LinkIcon, ArrowUpDown,
  History, Clock, HandHeart, CalendarClock,
} from "lucide-react";
import { MonthlyCheckInDialog } from "./MonthlyCheckInDialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listServeLeaders,
  logServeLeaderTouchpoint,
  listServeLeaderTouchpoints,
  deleteServeLeaderTouchpoint,
} from "@/lib/serve-leaders.functions";
import { TextComposerDialog } from "@/components/pastoral/TextComposerDialog";
import { LogReplyDialog } from "@/components/pastoral/LogReplyDialog";
import { TextThread, type TextTouchpoint } from "@/components/pastoral/TextThread";

type Person = {
  id: string;
  name: string;
  phone?: string | null;
  leader_groups?: string[];
};

function formatLeaderTitle(groups: string[] | undefined): string | null {
  if (!groups || groups.length === 0) return null;
  const suffix = (g: string) => (/leader|team|ministry/i.test(g) ? g : `${g} Team Leader`);
  if (groups.length === 1) return suffix(groups[0]);
  if (groups.length === 2) return `${suffix(groups[0])} · ${suffix(groups[1])}`;
  return `${suffix(groups[0])} +${groups.length - 1} more`;
}


type Meta = { last: string | null; count: number };

// A leader is "due" if it's been ≥ 25 days (roughly monthly with a small buffer)
const DUE_DAYS = 25;
const STALE_DAYS = 40;

type SortKey = "attention_first" | "name_asc" | "name_desc" | "last_recent" | "last_stale";

export function ServeLeadersList() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("attention_first");
  const [statusFilter, setStatusFilter] = useState<"any" | "due" | "recent">("any");
  const [meta, setMeta] = useState<Record<string, Meta>>({});
  const [logOpen, setLogOpen] = useState(false);
  const [monthlyOpen, setMonthlyOpen] = useState(false);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      const res: any = await listServeLeaders({ data: { refresh } });
      setPeople(res.people ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const refreshMeta = useCallback(async () => {
    try {
      const rows: any = await listServeLeaderTouchpoints({ data: { limit: 500 } });
      const m: Record<string, Meta> = {};
      for (const r of rows ?? []) {
        const existing = m[r.pco_person_id];
        if (!existing) {
          m[r.pco_person_id] = { last: r.created_at, count: 1 };
        } else {
          existing.count += 1;
          if (new Date(r.created_at) > new Date(existing.last ?? 0)) {
            existing.last = r.created_at;
          }
        }
      }
      setMeta(m);
    } catch { /* noop */ }
  }, []);

  useEffect(() => { refreshMeta(); }, [refreshMeta, people]);

  // Realtime for the owner's touchpoints
  useEffect(() => {
    const ch = supabase
      .channel("serve-leader-touchpoints")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "serve_leader_touchpoints" },
        () => refreshMeta(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refreshMeta]);

  function daysSince(iso: string | null): number | null {
    if (!iso) return null;
    return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (statusFilter !== "any") {
        const d = daysSince(meta[p.id]?.last ?? null);
        const isDue = d === null || d >= DUE_DAYS;
        if (statusFilter === "due" && !isDue) return false;
        if (statusFilter === "recent" && isDue) return false;
      }
      return true;
    });
  }, [people, search, statusFilter, meta]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const lastOf = (p: Person) => meta[p.id]?.last ?? null;
    arr.sort((a, b) => {
      switch (sort) {
        case "name_asc": return a.name.localeCompare(b.name);
        case "name_desc": return b.name.localeCompare(a.name);
        case "last_recent": {
          const la = lastOf(a) ? new Date(lastOf(a)!).getTime() : 0;
          const lb = lastOf(b) ? new Date(lastOf(b)!).getTime() : 0;
          return lb - la || a.name.localeCompare(b.name);
        }
        case "last_stale": {
          const la = lastOf(a) ? new Date(lastOf(a)!).getTime() : 0;
          const lb = lastOf(b) ? new Date(lastOf(b)!).getTime() : 0;
          return la - lb || a.name.localeCompare(b.name);
        }
        case "attention_first":
        default: {
          const da = daysSince(lastOf(a));
          const db = daysSince(lastOf(b));
          const na = da === null ? Number.MAX_SAFE_INTEGER : da;
          const nb = db === null ? Number.MAX_SAFE_INTEGER : db;
          return nb - na || a.name.localeCompare(b.name);
        }
      }
    });
    return arr;
  }, [filtered, sort, meta]);

  const dueCount = useMemo(
    () => people.filter((p) => {
      const d = daysSince(meta[p.id]?.last ?? null);
      return d === null || d >= DUE_DAYS;
    }).length,
    [people, meta],
  );

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const monthlyPending = people.filter((p) => {
    const last = meta[p.id]?.last;
    if (!last) return true;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    return new Date(last).getTime() < monthStart.getTime();
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <HandHeart className="w-5 h-5 text-[oklch(0.55_0.15_280)]" />
        <h1 className="text-xl font-display font-semibold">Serve Team Leaders</h1>
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[oklch(0.55_0.15_280)]/15 text-[oklch(0.55_0.15_280)]">
          Monthly check-ins
        </span>
        <span className="text-xs text-muted-foreground ml-2">
          {dueCount} of {people.length} due for check-in
        </span>
      </div>

      <div
        className={`flex items-center justify-between gap-3 rounded-2xl border p-3 ${
          monthlyPending.length > 0
            ? "border-[oklch(0.55_0.15_280)]/30 bg-[oklch(0.55_0.15_280)]/10"
            : "border-success/30 bg-success/10"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <CalendarClock className="w-4 h-4 text-[oklch(0.55_0.15_280)] shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium">
              {format(new Date(), "MMMM")} check-in queue
            </div>
            <div className="text-xs text-muted-foreground">
              {monthlyPending.length === 0
                ? "All leaders texted this month 🎉"
                : `${monthlyPending.length} of ${people.length} still need a text this month`}
            </div>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => setMonthlyOpen(true)}
          disabled={monthlyPending.length === 0}
          className="shrink-0"
        >
          <MessageSquare className="w-3.5 h-3.5 mr-1" />
          {monthlyPending.length === 0 ? "Done" : "Start check-ins"}
        </Button>
      </div>


      <div className="flex flex-col md:flex-row md:items-center gap-2">
        <div className="relative w-full md:w-56">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="h-9 md:h-8 text-sm pl-7 w-full"
          />
        </div>
        <div className="grid grid-cols-2 md:flex md:items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="h-9 md:h-8 md:w-40 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">All leaders</SelectItem>
              <SelectItem value="due">Due for check-in</SelectItem>
              <SelectItem value="recent">Recently checked</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-9 md:h-8 md:w-48 text-xs">
              <ArrowUpDown className="w-3 h-3 mr-1" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="attention_first">Needs check-in first</SelectItem>
              <SelectItem value="name_asc">Name · A → Z</SelectItem>
              <SelectItem value="name_desc">Name · Z → A</SelectItem>
              <SelectItem value="last_recent">Most recent contact</SelectItem>
              <SelectItem value="last_stale">Stalest first</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => setLogOpen(true)} className="h-9 md:h-8 text-xs justify-center">
            <History className="w-3.5 h-3.5 mr-1" /> Log
          </Button>
          <Button size="sm" variant="outline" onClick={() => load(true)} disabled={refreshing} className="h-9 md:h-8 justify-center">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span className="md:hidden ml-1 text-xs">Refresh</span>
          </Button>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
        {sorted.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">No leaders match.</div>
        )}
        {sorted.map((p) => {
          const last = meta[p.id]?.last ?? null;
          const count = meta[p.id]?.count ?? 0;
          const d = daysSince(last);
          const state: "green" | "amber" | "red" =
            d === null || d >= STALE_DAYS ? "red" : d >= DUE_DAYS ? "amber" : "green";
          return (
            <div key={p.id}>
              <div
                className="flex items-center justify-between px-4 py-3 hover:bg-background/40 cursor-pointer"
                onClick={() => setExpanded(expanded === p.id ? null : p.id)}
              >
                <div className="min-w-0 flex items-center gap-2">
                  <StatusDot state={state} days={d} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    {formatLeaderTitle(p.leader_groups) && (
                      <div className="text-[11px] text-[oklch(0.55_0.15_280)] truncate">
                        {formatLeaderTitle(p.leader_groups)}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground truncate">
                      {last
                        ? `Last contact ${formatDistanceToNow(new Date(last), { addSuffix: true })}`
                        : "No check-in logged yet"}
                      {count ? ` · ${count} touchpoint${count === 1 ? "" : "s"}` : ""}
                    </div>
                  </div>

                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge state={state} days={d} />
                </div>
              </div>
              {expanded === p.id && (
                <PersonPanel person={p} onChanged={refreshMeta} />
              )}
            </div>
          );
        })}
      </div>

      <TouchpointLogDialog open={logOpen} onOpenChange={setLogOpen} people={people} onChanged={refreshMeta} />
      <MonthlyCheckInDialog
        open={monthlyOpen}
        onOpenChange={setMonthlyOpen}
        people={people}
        meta={meta}
        onChanged={refreshMeta}
      />
    </div>
  );
}

function StatusDot({ state, days }: { state: "green" | "amber" | "red"; days: number | null }) {
  const cls = state === "red" ? "bg-destructive" : state === "amber" ? "bg-warning" : "bg-success";
  const title = days === null ? "No check-in logged" : `${days} day${days === 1 ? "" : "s"} since last contact`;
  return <span title={title} className={`w-2 h-2 rounded-full shrink-0 ${cls}`} />;
}

function StatusBadge({ state, days }: { state: "green" | "amber" | "red"; days: number | null }) {
  const label = days === null ? "Never" : `${days}d`;
  const cls =
    state === "red"
      ? "bg-destructive/10 border-destructive/30 text-destructive"
      : state === "amber"
        ? "bg-warning/10 border-warning/30 text-warning-foreground"
        : "bg-success/10 border-success/30 text-success-foreground";
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${cls}`}>
      {label}
    </span>
  );
}

function PersonPanel({ person, onChanged }: { person: Person; onChanged: () => void }) {
  const [texts, setTexts] = useState<TextTouchpoint[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);

  const loadTouchpoints = useCallback(async () => {
    try {
      const r: any = await listServeLeaderTouchpoints({
        data: { pco_person_id: person.id, limit: 200 },
      });
      setRows(r ?? []);
      setTexts((r ?? []).filter((x: any) => x.kind === "text"));
    } catch { /* noop */ }
  }, [person.id]);

  useEffect(() => { loadTouchpoints(); }, [loadTouchpoints]);

  useEffect(() => {
    const ch = supabase
      .channel(`serve-leader-tp-${person.id}`)
      .on(
        "postgres_changes",
        {
          event: "*", schema: "public", table: "serve_leader_touchpoints",
          filter: `pco_person_id=eq.${person.id}`,
        },
        () => { loadTouchpoints(); onChanged(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [person.id, loadTouchpoints, onChanged]);

  const lastText = useMemo(() => {
    if (texts.length === 0) return null;
    return [...texts].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];
  }, [texts]);
  const awaitingReply = lastText?.direction === "outbound";

  async function quickLog(kind: "call" | "email" | "in_person" | "other") {
    try {
      await logServeLeaderTouchpoint({
        data: {
          pco_person_id: person.id,
          person_name: person.name,
          kind,
          direction: "outbound",
        },
      });
      toast.success("Check-in logged");
      loadTouchpoints();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to log");
    }
  }

  return (
    <div className="px-4 pb-4 bg-background/30 border-t border-border space-y-3">
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <button
          type="button"
          onClick={() => {
            if (!person.phone) {
              toast.error("No phone number on file in Planning Center");
              return;
            }
            setComposerOpen(true);
          }}
          className={`text-xs inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border ${
            person.phone
              ? "border-[oklch(0.55_0.15_280)]/30 text-[oklch(0.55_0.15_280)] hover:bg-[oklch(0.55_0.15_280)]/10"
              : "border-border text-muted-foreground opacity-60 cursor-not-allowed"
          }`}
          title={person.phone ? `Text ${person.phone}` : "No phone on file"}
        >
          <MessageSquare className="w-3.5 h-3.5" /> Text
        </button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => quickLog("call")}>+ Call</Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => quickLog("email")}>+ Email</Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => quickLog("in_person")}>+ In person</Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => quickLog("other")}>+ Other</Button>
        <a
          href={`https://people.planningcenteronline.com/people/${person.id}`}
          target="_blank" rel="noreferrer"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border ml-auto"
        >
          <LinkIcon className="w-3.5 h-3.5" /> Open in PCO
        </a>
      </div>

      {awaitingReply && lastText && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10">
          <Clock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium">
              Awaiting reply from {person.name.split(/\s+/)[0]}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Sent {format(new Date(lastText.created_at), "MMM d, h:mm a")}
            </div>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => setReplyOpen(true)}>
            + Log reply
          </Button>
        </div>
      )}

      {texts.length > 0 && (
        <TextThread
          personName={person.name}
          touchpoints={texts}
          onChanged={loadTouchpoints}
          deleteTouchpoint={deleteServeLeaderTouchpoint as any}
        />
      )}

      {!awaitingReply && texts.length > 0 && (
        <div>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setReplyOpen(true)}>
            + Log a reply
          </Button>
        </div>
      )}

      {rows.filter((r) => r.kind !== "text").length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Other touchpoints</div>
          {rows.filter((r) => r.kind !== "text").map((r) => (
            <div key={r.id} className="text-xs border border-border rounded p-2 flex items-start justify-between gap-2 group">
              <div className="min-w-0">
                <div className="font-medium">
                  <KindLabel kind={r.kind} />
                  <span className="text-muted-foreground font-normal ml-2">
                    {format(new Date(r.created_at), "MMM d, yyyy h:mm a")}
                  </span>
                </div>
                {r.note && <div className="whitespace-pre-wrap mt-1">{r.note}</div>}
              </div>
              <button
                onClick={async () => {
                  if (!confirm("Delete touchpoint?")) return;
                  try {
                    await deleteServeLeaderTouchpoint({ data: { id: r.id } });
                    loadTouchpoints();
                    onChanged();
                  } catch (e: any) {
                    toast.error(e?.message ?? "Failed");
                  }
                }}
                className="opacity-60 md:opacity-0 md:group-hover:opacity-100 hover:text-destructive p-1 -m-1 shrink-0"
                title="Delete"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {person.phone && (
        <TextComposerDialog
          open={composerOpen}
          onOpenChange={setComposerOpen}
          personId={person.id}
          personName={person.name}
          phone={person.phone}
          onSent={() => { loadTouchpoints(); onChanged(); }}
          logTouchpoint={logServeLeaderTouchpoint as any}
        />
      )}
      <LogReplyDialog
        open={replyOpen}
        onOpenChange={setReplyOpen}
        personId={person.id}
        personName={person.name}
        onLogged={() => { loadTouchpoints(); onChanged(); }}
        logTouchpoint={logServeLeaderTouchpoint as any}
      />
    </div>
  );
}

function KindLabel({ kind }: { kind: string }) {
  const map: Record<string, string> = {
    call: "Call", email: "Email", in_person: "In person", other: "Other", text: "Text",
  };
  return (
    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-background border border-border text-muted-foreground">
      {map[kind] ?? kind}
    </span>
  );
}

function TouchpointLogDialog({
  open, onOpenChange, people, onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  people: Person[];
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const personName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of people) m[p.id] = p.name;
    return m;
  }, [people]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listServeLeaderTouchpoints({ data: { limit: 300 } })
      .then((r: any) => setRows(r ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [open]);

  const kindLabel: Record<string, string> = {
    text: "Text", call: "Call", email: "Email", in_person: "In person", other: "Other",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Touchpoint log</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No touchpoints logged yet.</div>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.id} className="text-xs border border-border rounded p-2 flex items-start justify-between gap-2 group">
                <div className="min-w-0">
                  <div className="font-medium">
                    {personName[r.pco_person_id] ?? r.person_name ?? "Unknown"}
                    <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-background border border-border text-muted-foreground">
                      {kindLabel[r.kind] ?? r.kind}
                    </span>
                    {r.direction && (
                      <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        {r.direction}
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground">
                    {format(new Date(r.created_at), "MMM d, yyyy h:mm a")}
                  </div>
                  {r.note && <div className="whitespace-pre-wrap mt-1">{r.note}</div>}
                </div>
                <button
                  onClick={async () => {
                    if (!confirm("Delete touchpoint?")) return;
                    try {
                      await deleteServeLeaderTouchpoint({ data: { id: r.id } });
                      setRows((prev) => prev.filter((x) => x.id !== r.id));
                      onChanged();
                    } catch (e: any) {
                      toast.error(e?.message ?? "Failed");
                    }
                  }}
                  className="opacity-60 md:opacity-0 md:group-hover:opacity-100 hover:text-destructive p-1 -m-1 shrink-0"
                  title="Delete"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
