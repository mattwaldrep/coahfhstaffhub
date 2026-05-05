import { useEffect, useMemo, useState, useCallback } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Lock, MessageSquarePlus, RefreshCw, Search, Trash2, Link as LinkIcon, X, ArrowUpDown } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import {
  listCareList, listPcoNotes, addPcoNote, deletePcoNote, updateSpiritualHealth,
} from "@/server/pastoral-care.functions";
import { supabase } from "@/integrations/supabase/client";

const HEALTH_OPTIONS = ["Thriving", "Healthy", "Watch", "Struggling", "Crisis", "Unknown"];
// Severity ranking — higher = more urgent (used for "by health (urgent first)")
const HEALTH_SEVERITY: Record<string, number> = {
  Crisis: 5, Struggling: 4, Watch: 3, Unknown: 2, Healthy: 1, Thriving: 0,
};

type SortKey =
  | "name_asc"
  | "name_desc"
  | "health_urgent"
  | "health_thriving"
  | "notes_most"
  | "notes_recent"
  | "notes_stale";


type Person = {
  id: string;
  name: string;
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
  const [sort, setSort] = useState<SortKey>("health_urgent");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [latestNote, setLatestNote] = useState<Record<string, string>>({}); // pco_person_id -> ISO date

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
    return people.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;

      const health = (fields ? p.fields[fields.spiritual_health]?.value : null) ?? "Unknown";
      if (healthFilter.size > 0 && !healthFilter.has(health)) return false;

      const elderVal = (fields ? p.fields[fields.assigned_elder]?.value : null)?.trim() || "";
      if (elderFilter === "unassigned" && elderVal) return false;
      if (elderFilter !== "all" && elderFilter !== "unassigned" && elderVal !== elderFilter) return false;

      const noteCount = counts[p.id] ?? 0;
      if (notesFilter === "with" && noteCount === 0) return false;
      if (notesFilter === "without" && noteCount > 0) return false;

      return true;
    });
  }, [people, fields, search, healthFilter, elderFilter, notesFilter, counts]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const healthOf = (p: Person) =>
      (fields ? p.fields[fields.spiritual_health]?.value : null) ?? "Unknown";
    arr.sort((a, b) => {
      switch (sort) {
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
          // No notes first, then oldest last note
          const la = latestNote[a.id] ? new Date(latestNote[a.id]).getTime() : 0;
          const lb = latestNote[b.id] ? new Date(latestNote[b.id]).getTime() : 0;
          return la - lb || a.name.localeCompare(b.name);
        }
      }
    });
    return arr;
  }, [filtered, sort, counts, latestNote, fields]);

  const toggleHealth = (h: string) => {
    setHealthFilter((prev) => {
      const next = new Set(prev);
      if (next.has(h)) next.delete(h); else next.add(h);
      return next;
    });
  };

  const activeFilterCount =
    (search ? 1 : 0) + healthFilter.size + (elderFilter !== "all" ? 1 : 0) + (notesFilter !== "any" ? 1 : 0);

  const clearAll = () => {
    setSearch(""); setHealthFilter(new Set()); setElderFilter("all"); setNotesFilter("any");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {variant === "page" && (
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-display font-semibold">Pastoral care</h2>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[oklch(0.55_0.15_280)]/15 text-[oklch(0.55_0.15_280)]">
              Synced from Planning Center
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="h-8 text-sm pl-7 w-48"
            />
          </div>

          <Select value={elderFilter} onValueChange={setElderFilter}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="Assigned elder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All elders</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {elderOptions.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={notesFilter} onValueChange={(v) => setNotesFilter(v as any)}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue placeholder="Notes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any notes</SelectItem>
              <SelectItem value="with">Has notes</SelectItem>
              <SelectItem value="without">No notes</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-8 w-48 text-xs">
              <ArrowUpDown className="w-3 h-3 mr-1" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="health_urgent">Health · urgent first</SelectItem>
              <SelectItem value="health_thriving">Health · thriving first</SelectItem>
              <SelectItem value="name_asc">Name · A → Z</SelectItem>
              <SelectItem value="name_desc">Name · Z → A</SelectItem>
              <SelectItem value="notes_recent">Most recent note</SelectItem>
              <SelectItem value="notes_stale">Stalest (no/oldest note)</SelectItem>
              <SelectItem value="notes_most">Most notes</SelectItem>
            </SelectContent>
          </Select>

          <Button size="sm" variant="outline" onClick={() => load(true)} disabled={refreshing} title="Refresh from Planning Center">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Health quick-filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Health</span>
        {HEALTH_OPTIONS.map((h) => {
          const active = healthFilter.has(h);
          const count = people.filter((p) => ((fields ? p.fields[fields.spiritual_health]?.value : null) ?? "Unknown") === h).length;
          return (
            <button
              key={h}
              type="button"
              onClick={() => toggleHealth(h)}
              className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
                active
                  ? "bg-[oklch(0.55_0.15_280)]/15 border-[oklch(0.55_0.15_280)]/40 text-[oklch(0.55_0.15_280)]"
                  : "bg-background border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {h} <span className="opacity-60">{count}</span>
            </button>
          );
        })}
        {activeFilterCount > 0 && (
          <button
            onClick={clearAll}
            className="text-[11px] inline-flex items-center gap-1 text-muted-foreground hover:text-foreground ml-2"
          >
            <X className="w-3 h-3" /> Clear filters
          </button>
        )}
        <span className="text-[11px] text-muted-foreground ml-auto">
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
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {elder ? `Assigned: ${elder}` : "Unassigned"}
                    {counts[p.id] ? ` · ${counts[p.id]} note${counts[p.id] === 1 ? "" : "s"}` : ""}
                    {last ? ` · last ${format(new Date(last), "MMM d")}` : ""}
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
    </div>
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
        <a
          href={`https://people.planningcenteronline.com/people/${person.id}`}
          target="_blank" rel="noreferrer"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 ml-auto"
        >
          <LinkIcon className="w-3 h-3" /> Open in PCO
        </a>
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
                className="opacity-0 group-hover:opacity-100 hover:text-destructive"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            <div className="whitespace-pre-wrap mt-1">{n.body}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 items-start">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Add update…" className="text-sm" />
        <div className="flex flex-col gap-1">
          {isFullElder && (
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={exec} onChange={(e) => setExec(e.target.checked)} />
              Exec
            </label>
          )}
          <Button size="sm" variant="outline" onClick={post} disabled={saving}>
            <MessageSquarePlus className="w-3 h-3 mr-1" /> Post
          </Button>
        </div>
      </div>
    </div>
  );
}
