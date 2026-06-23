import { useEffect, useMemo, useState, useCallback } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Lock, MessageSquarePlus, MessageSquare, RefreshCw, Search, Trash2, Link as LinkIcon, X, ArrowUpDown, History, UserCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import {
  listCareList, listPcoNotes, addPcoNote, deletePcoNote, updateSpiritualHealth,
  logTouchpoint, listTouchpoints, deleteTouchpoint, getMyElderName,
} from "@/lib/pastoral-care.functions";
import { getPastoralGaps, type PastoralGap } from "@/lib/pastoral-gaps.functions";
import { supabase } from "@/integrations/supabase/client";
import { CareLoadCard } from "@/components/pastoral/CareLoadCard";

const HEALTH_OPTIONS = ["Thriving", "Healthy", "Watch", "Struggling", "Crisis", "Unknown"];
// Severity ranking — higher = more urgent (used for "by health (urgent first)")
const HEALTH_SEVERITY: Record<string, number> = {
  Crisis: 5, Struggling: 4, Watch: 3, Unknown: 2, Healthy: 1, Thriving: 0,
};

type SortKey =
  | "attention_first"
  | "name_asc"
  | "name_desc"
  | "health_urgent"
  | "health_thriving"
  | "notes_most"
  | "notes_recent"
  | "notes_stale";

const LEVEL_RANK: Record<"red" | "amber" | "green", number> = { red: 2, amber: 1, green: 0 };



type Person = {
  id: string;
  name: string;
  phone?: string | null;
  fields: Record<string, { datum_id: string; value: string | null }>;
};

type Props = {
  /** When set, "Post" calls tag the note with this meeting id. */
  meetingId?: string;
  /** Compact heading inside meeting context. */
  variant?: "page" | "meeting";
};

export function PastoralCareList({ meetingId, variant = "page" }: Props) {
  const { isFullElder } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [fields, setFields] = useState<{ assigned_elder: string; spiritual_health: string } | null>(null);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState<Set<string>>(new Set());
  const [elderFilter, setElderFilter] = useState<string>("all"); // "all" | "unassigned" | elder name
  const [notesFilter, setNotesFilter] = useState<"any" | "with" | "without">("any");
  const [sort, setSort] = useState<SortKey>("attention_first");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [latestNote, setLatestNote] = useState<Record<string, string>>({}); // pco_person_id -> ISO date
  const [myElderName, setMyElderName] = useState<string | null>(null);
  const [myPeopleActive, setMyPeopleActive] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [gaps, setGaps] = useState<Record<string, PastoralGap>>({});

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      const res: any = await listCareList({ data: { refresh } });
      setConfigured(res.configured);
      setFields(res.fields);
      setPeople(res.people ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  // Load current user's elder name (used by "My people" filter)
  useEffect(() => {
    (async () => {
      try {
        const res: any = await getMyElderName();
        setMyElderName(res?.full_name ?? null);
      } catch { /* noop */ }
    })();
  }, []);


  // Refresh note counts and last-note date whenever the people list changes
  const refreshNoteMeta = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const { data } = await supabase
      .from("pco_pastoral_notes")
      .select("pco_person_id, created_at")
      .in("pco_person_id", ids)
      .order("created_at", { ascending: false });
    const c: Record<string, number> = {};
    const last: Record<string, string> = {};
    for (const r of (data ?? []) as any[]) {
      c[r.pco_person_id] = (c[r.pco_person_id] ?? 0) + 1;
      if (!last[r.pco_person_id]) last[r.pco_person_id] = r.created_at;
    }
    setCounts(c);
    setLatestNote(last);
  }, []);

  useEffect(() => {
    refreshNoteMeta(people.map((p) => p.id));
  }, [people, refreshNoteMeta]);

  // Load forgotten-person levels
  useEffect(() => {
    (getPastoralGaps as any)()
      .then((r: any) => {
        const map: Record<string, PastoralGap> = {};
        for (const g of (r?.gaps ?? []) as PastoralGap[]) map[g.pco_person_id] = g;
        setGaps(map);
      })
      .catch(() => setGaps({}));
  }, [people]);


  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel("pco-pastoral-notes")
      .on("postgres_changes", { event: "*", schema: "public", table: "pco_pastoral_notes" }, () => {
        refreshNoteMeta(people.map((p) => p.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [people, refreshNoteMeta]);

  const elderOptions = useMemo(() => {
    if (!fields) return [] as string[];
    const set = new Set<string>();
    for (const p of people) {
      const v = p.fields[fields.assigned_elder]?.value;
      if (v && v.trim()) set.add(v.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [people, fields]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const me = (myElderName ?? "").trim().toLowerCase();
    return people.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;

      const health = (fields ? p.fields[fields.spiritual_health]?.value : null) ?? "Unknown";
      if (healthFilter.size > 0 && !healthFilter.has(health)) return false;

      const elderVal = (fields ? p.fields[fields.assigned_elder]?.value : null)?.trim() || "";
      if (myPeopleActive) {
        if (!me) return false;
        if (elderVal.toLowerCase() !== me) return false;
      }
      if (elderFilter === "unassigned" && elderVal) return false;
      if (elderFilter !== "all" && elderFilter !== "unassigned" && elderVal !== elderFilter) return false;

      const noteCount = counts[p.id] ?? 0;
      if (notesFilter === "with" && noteCount === 0) return false;
      if (notesFilter === "without" && noteCount > 0) return false;

      return true;
    });
  }, [people, fields, search, healthFilter, elderFilter, notesFilter, counts, myPeopleActive, myElderName]);


  const sorted = useMemo(() => {
    const arr = [...filtered];
    const healthOf = (p: Person) =>
      (fields ? p.fields[fields.spiritual_health]?.value : null) ?? "Unknown";
    arr.sort((a, b) => {
      switch (sort) {
        case "attention_first": {
          const la = LEVEL_RANK[gaps[a.id]?.level ?? "green"];
          const lb = LEVEL_RANK[gaps[b.id]?.level ?? "green"];
          if (la !== lb) return lb - la;
          const da = gaps[a.id]?.days_since ?? -1;
          const db = gaps[b.id]?.days_since ?? -1;
          // null (never) treated as most-stale: bigger first
          const na = da === null ? Number.MAX_SAFE_INTEGER : da;
          const nb = db === null ? Number.MAX_SAFE_INTEGER : db;
          return nb - na || a.name.localeCompare(b.name);
        }
        case "name_asc": return a.name.localeCompare(b.name);
        case "name_desc": return b.name.localeCompare(a.name);
        case "health_urgent":
          return (HEALTH_SEVERITY[healthOf(b)] ?? 0) - (HEALTH_SEVERITY[healthOf(a)] ?? 0)
            || a.name.localeCompare(b.name);
        case "health_thriving":
          return (HEALTH_SEVERITY[healthOf(a)] ?? 0) - (HEALTH_SEVERITY[healthOf(b)] ?? 0)
            || a.name.localeCompare(b.name);
        case "notes_most":
          return (counts[b.id] ?? 0) - (counts[a.id] ?? 0) || a.name.localeCompare(b.name);
        case "notes_recent": {
          const la = latestNote[a.id] ? new Date(latestNote[a.id]).getTime() : 0;
          const lb = latestNote[b.id] ? new Date(latestNote[b.id]).getTime() : 0;
          return lb - la || a.name.localeCompare(b.name);
        }
        case "notes_stale": {
          const la = latestNote[a.id] ? new Date(latestNote[a.id]).getTime() : 0;
          const lb = latestNote[b.id] ? new Date(latestNote[b.id]).getTime() : 0;
          return la - lb || a.name.localeCompare(b.name);
        }
        default:
          return 0;
      }
    });
    return arr;
  }, [filtered, sort, counts, latestNote, fields, gaps]);


  const toggleHealth = (h: string) => {
    setHealthFilter((prev) => {
      const next = new Set(prev);
      if (next.has(h)) next.delete(h); else next.add(h);
      return next;
    });
  };

  const activeFilterCount =
    (search ? 1 : 0) + healthFilter.size + (elderFilter !== "all" ? 1 : 0) + (notesFilter !== "any" ? 1 : 0) + (myPeopleActive ? 1 : 0);

  const clearAll = () => {
    setSearch(""); setHealthFilter(new Set()); setElderFilter("all"); setNotesFilter("any"); setMyPeopleActive(false);
  };


  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  if (!configured) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-6">
        <div className="text-sm font-medium">Planning Center isn't configured yet.</div>
        <p className="text-xs text-muted-foreground mt-1">
          A full elder needs to set the care list ID and custom field IDs.
        </p>
        <Link to="/elder/settings" className="inline-block mt-3 text-xs text-[oklch(0.55_0.15_280)] hover:underline">
          Open Elder settings →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {variant === "page" && <CareLoadCard />}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {variant === "page" && (
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-display font-semibold">Pastoral care</h2>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[oklch(0.55_0.15_280)]/15 text-[oklch(0.55_0.15_280)]">
              Synced from Planning Center
            </span>
          </div>
        )}

        {/* Toolbar — stacks on mobile, inline on desktop */}
        <div className="flex flex-col md:flex-row md:items-center gap-2 md:ml-auto w-full md:w-auto">
          <div className="relative w-full md:w-48">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="h-9 md:h-8 text-sm pl-7 w-full"
            />
          </div>

          <div className="grid grid-cols-2 md:flex md:items-center gap-2">
            <Button
              size="sm"
              variant={myPeopleActive ? "default" : "outline"}
              onClick={() => {
                if (!myElderName) {
                  toast.error("Your profile name doesn't match an elder. Update your full name in settings.");
                  return;
                }
                setMyPeopleActive((v) => !v);
              }}
              title={myElderName ? `Show people assigned to ${myElderName}` : "Set your full name in settings"}
              className="h-9 md:h-8 text-xs justify-center"
            >
              <UserCheck className="w-3.5 h-3.5 mr-1" />
              My people
            </Button>

            <Select value={elderFilter} onValueChange={setElderFilter}>
              <SelectTrigger className="h-9 md:h-8 md:w-40 text-xs">
                <SelectValue placeholder="Assigned elder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All elders</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {elderOptions.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={notesFilter} onValueChange={(v) => setNotesFilter(v as any)}>
              <SelectTrigger className="h-9 md:h-8 md:w-32 text-xs">
                <SelectValue placeholder="Notes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any notes</SelectItem>
                <SelectItem value="with">Has notes</SelectItem>
                <SelectItem value="without">No notes</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="h-9 md:h-8 md:w-48 text-xs">
                <ArrowUpDown className="w-3 h-3 mr-1" />
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="attention_first">Needs attention first</SelectItem>
                <SelectItem value="health_urgent">Health · urgent first</SelectItem>
                <SelectItem value="health_thriving">Health · thriving first</SelectItem>
                <SelectItem value="name_asc">Name · A → Z</SelectItem>
                <SelectItem value="name_desc">Name · Z → A</SelectItem>
                <SelectItem value="notes_recent">Most recent note</SelectItem>
                <SelectItem value="notes_stale">Stalest (no/oldest note)</SelectItem>
                <SelectItem value="notes_most">Most notes</SelectItem>
              </SelectContent>
            </Select>

            <Button size="sm" variant="outline" onClick={() => setLogOpen(true)} title="View touchpoint log" className="h-9 md:h-8 text-xs justify-center">
              <History className="w-3.5 h-3.5 mr-1" /> Log
            </Button>

            <Button size="sm" variant="outline" onClick={() => load(true)} disabled={refreshing} title="Refresh from Planning Center" className="h-9 md:h-8 justify-center">
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span className="md:hidden ml-1 text-xs">Refresh</span>
            </Button>
          </div>
        </div>
      </div>


      {/* Health quick-filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground shrink-0">Health</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {HEALTH_OPTIONS.map((h) => {
            const active = healthFilter.has(h);
            const count = people.filter((p) => ((fields ? p.fields[fields.spiritual_health]?.value : null) ?? "Unknown") === h).length;
            return (
              <button
                key={h}
                type="button"
                onClick={() => toggleHealth(h)}
                className={`text-[11px] px-2 py-1 rounded-full border transition ${
                  active
                    ? "bg-[oklch(0.55_0.15_280)]/15 border-[oklch(0.55_0.15_280)]/40 text-[oklch(0.55_0.15_280)]"
                    : "bg-background border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {h} <span className="opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
        {activeFilterCount > 0 && (
          <button
            onClick={clearAll}
            className="text-[11px] inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3 h-3" /> Clear filters
          </button>
        )}
        <span className="text-[11px] text-muted-foreground ml-auto shrink-0">
          {sorted.length} of {people.length}
        </span>
      </div>


      <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
        {sorted.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">No people match.</div>
        )}
        {sorted.map((p) => {
          const health = fields ? p.fields[fields.spiritual_health]?.value : null;
          const elder = fields ? p.fields[fields.assigned_elder]?.value : null;
          const last = latestNote[p.id];
          return (
            <div key={p.id}>
              <div
                className="flex items-center justify-between px-4 py-3 hover:bg-background/40 cursor-pointer"
                onClick={() => setExpanded(expanded === p.id ? null : p.id)}
              >
                <div className="min-w-0 flex items-center gap-2">
                  <AttentionDot level={gaps[p.id]?.level} days={gaps[p.id]?.days_since ?? null} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {elder ? `Assigned: ${elder}` : "Unassigned"}
                      {counts[p.id] ? ` · ${counts[p.id]} note${counts[p.id] === 1 ? "" : "s"}` : ""}
                      {last ? ` · last ${format(new Date(last), "MMM d")}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-background border border-border">
                    {health ?? "Unknown"}
                  </span>
                </div>
              </div>
              {expanded === p.id && (
                <PersonPanel
                  person={p}
                  fields={fields!}
                  isFullElder={isFullElder}
                  meetingId={meetingId}
                  onHealthChanged={() => load(true)}
                />
              )}
            </div>
          );
        })}
      </div>

      <TouchpointLogDialog open={logOpen} onOpenChange={setLogOpen} people={people} />
    </div>
  );
}

function TouchpointLogDialog({
  open, onOpenChange, people,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  people: Person[];
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
    listTouchpoints({ data: { limit: 200 } })
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
                    {personName[r.pco_person_id] ?? r.person_name ?? "Unknown person"}
                    <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-background border border-border text-muted-foreground">
                      {kindLabel[r.kind] ?? r.kind}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    {format(new Date(r.created_at), "MMM d, yyyy h:mm a")} · {r.user_name}
                  </div>
                  {r.note && <div className="whitespace-pre-wrap mt-1">{r.note}</div>}
                </div>
                <button
                  onClick={async () => {
                    if (!confirm("Delete touchpoint?")) return;
                    try {
                      await deleteTouchpoint({ data: { id: r.id } });
                      setRows((prev) => prev.filter((x) => x.id !== r.id));
                    } catch (e: any) {
                      toast.error(e.message ?? "Failed");
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


function PersonPanel({
  person, fields, isFullElder, meetingId, onHealthChanged,
}: {
  person: Person;
  fields: { assigned_elder: string; spiritual_health: string };
  isFullElder: boolean;
  meetingId?: string;
  onHealthChanged: () => void;
}) {
  const [notes, setNotes] = useState<any[]>([]);
  const [body, setBody] = useState("");
  const [exec, setExec] = useState(false);
  const [saving, setSaving] = useState(false);
  const health = person.fields[fields.spiritual_health];

  const load = useCallback(async () => {
    try {
      const rows = await listPcoNotes({ data: { pco_person_id: person.id } });
      setNotes(rows as any[]);
    } catch { /* noop */ }
  }, [person.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel(`pco-notes-${person.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "pco_pastoral_notes",
        filter: `pco_person_id=eq.${person.id}`,
      }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [person.id, load]);

  async function post() {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await addPcoNote({
        data: {
          pco_person_id: person.id,
          body: body.trim(),
          executive_session: exec,
          meeting_id: meetingId ?? null,
        },
      });
      setBody(""); setExec(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 pb-4 bg-background/30 border-t border-border space-y-3">
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <div className="text-xs text-muted-foreground">Spiritual health:</div>
        {isFullElder ? (
          <Select
            value={health?.value ?? ""}
            onValueChange={async (v) => {
              try {
                await updateSpiritualHealth({
                  data: { person_id: person.id, datum_id: health?.datum_id ?? null, value: v },
                });
                toast.success("Updated in Planning Center");
                onHealthChanged();
              } catch (e: any) {
                toast.error(e.message ?? "Failed");
              }
            }}
          >
            <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="Set status" /></SelectTrigger>
            <SelectContent>
              {HEALTH_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs">{health?.value ?? "Unknown"}</span>
        )}
        <div className="flex items-center gap-3 md:ml-auto flex-wrap w-full md:w-auto">
          {(() => {
            const firstName = person.name.split(/\s+/)[0] ?? "";
            const draft = `Hey ${firstName}, `;
            const href = person.phone
              ? `sms:${person.phone}?&body=${encodeURIComponent(draft)}`
              : undefined;
            return (
              <a
                href={href}
                onClick={(e) => {
                  if (!person.phone) {
                    e.preventDefault();
                    toast.error("No phone number on file in Planning Center");
                    return;
                  }
                  // Fire-and-forget log of the touchpoint
                  logTouchpoint({
                    data: {
                      pco_person_id: person.id,
                      person_name: person.name,
                      kind: "text",
                    },
                  }).catch(() => { /* noop */ });
                }}
                className={`text-xs inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border ${
                  person.phone
                    ? "border-[oklch(0.55_0.15_280)]/30 text-[oklch(0.55_0.15_280)] hover:bg-[oklch(0.55_0.15_280)]/10"
                    : "border-border text-muted-foreground opacity-60 cursor-not-allowed"
                }`}
                title={person.phone ? `Text ${person.phone}` : "No phone on file"}
              >
                <MessageSquare className="w-3.5 h-3.5" /> Text
              </a>
            );
          })()}
          <a
            href={`https://people.planningcenteronline.com/people/${person.id}`}
            target="_blank" rel="noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border"
          >
            <LinkIcon className="w-3.5 h-3.5" /> Open in PCO
          </a>
        </div>

      </div>

      <div className="space-y-2">
        {notes.length === 0 && <div className="text-xs text-muted-foreground">No notes yet.</div>}
        {notes.map((n) => (
          <div key={n.id} className="text-xs bg-surface border border-border rounded p-2 group">
            <div className="flex items-center justify-between text-muted-foreground">
              <div className="flex items-center gap-2">
                {format(new Date(n.created_at), "MMM d, yyyy h:mm a")}
                {n.executive_session && <Lock className="w-3 h-3 text-[oklch(0.55_0.15_280)]" />}
                {n.meeting_id && (
                  <Link to="/elder/meetings/$meetingId" params={{ meetingId: n.meeting_id }} className="hover:underline">
                    from meeting
                  </Link>
                )}
              </div>
              <button
                onClick={async () => {
                  if (!confirm("Delete note?")) return;
                  try { await deletePcoNote({ data: { id: n.id } }); load(); }
                  catch (e: any) { toast.error(e.message ?? "Failed"); }
                }}
                className="opacity-60 md:opacity-0 md:group-hover:opacity-100 hover:text-destructive p-1 -m-1"
                aria-label="Delete note"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="whitespace-pre-wrap mt-1">{n.body}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-start">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Add update…" className="text-sm flex-1" />
        <div className="flex sm:flex-col gap-2 sm:gap-1 items-center sm:items-stretch justify-between sm:justify-start">
          {isFullElder && (
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={exec} onChange={(e) => setExec(e.target.checked)} />
              Exec
            </label>
          )}
          <Button size="sm" variant="outline" onClick={post} disabled={saving} className="h-9 sm:h-8">
            <MessageSquarePlus className="w-3.5 h-3.5 mr-1" /> Post
          </Button>
        </div>
      </div>

    </div>
  );
}

function AttentionDot({ level, days }: { level?: "green" | "amber" | "red"; days: number | null }) {
  if (!level) return <span className="w-2 h-2 rounded-full bg-border shrink-0" />;
  const cls =
    level === "red" ? "bg-destructive" : level === "amber" ? "bg-warning" : "bg-success";
  const title =
    days === null
      ? "No pastoral contact logged"
      : `Last contact ${days} day${days === 1 ? "" : "s"} ago`;
  return <span title={title} className={`w-2 h-2 rounded-full shrink-0 ${cls}`} />;
}

