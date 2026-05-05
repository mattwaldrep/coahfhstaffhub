import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Lock, MessageSquarePlus, RefreshCw, Search, Trash2, Link as LinkIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import {
  listCareList, listPcoNotes, addPcoNote, deletePcoNote, updateSpiritualHealth,
} from "@/server/pastoral-care.functions";
import { supabase } from "@/integrations/supabase/client";

const HEALTH_OPTIONS = ["Thriving", "Healthy", "Watch", "Struggling", "Crisis", "Unknown"];

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
  const [filter, setFilter] = useState<"all" | "health">("all");
  const [healthFilter, setHealthFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});

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

  // Refresh note counts whenever the people list changes
  useEffect(() => {
    if (people.length === 0) return;
    (async () => {
      const ids = people.map((p) => p.id);
      const { data } = await supabase
        .from("pco_pastoral_notes")
        .select("pco_person_id")
        .in("pco_person_id", ids);
      const c: Record<string, number> = {};
      for (const r of (data ?? []) as any[]) {
        c[r.pco_person_id] = (c[r.pco_person_id] ?? 0) + 1;
      }
      setCounts(c);
    })();
  }, [people]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel("pco-pastoral-notes")
      .on("postgres_changes", { event: "*", schema: "public", table: "pco_pastoral_notes" }, () => {
        // bump expanded view by re-rendering; expanded panel listens itself too
        setCounts((prev) => ({ ...prev }));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

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

  const filtered = people.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "health" && healthFilter) {
      const v = fields ? p.fields[fields.spiritual_health]?.value : null;
      if ((v ?? "Unknown") !== healthFilter) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {variant === "page" && (
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-display font-semibold">Pastoral care</h2>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[oklch(0.55_0.15_280)]/15 text-[oklch(0.55_0.15_280)]">
              Synced from Planning Center
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-8 text-sm pl-7 w-48"
            />
          </div>
          <Select value={filter === "all" ? "all" : healthFilter || "__pick"} onValueChange={(v) => {
            if (v === "all") { setFilter("all"); setHealthFilter(""); }
            else { setFilter("health"); setHealthFilter(v); }
          }}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Filter" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All people</SelectItem>
              {HEALTH_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
        {filtered.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">No people match.</div>
        )}
        {filtered.map((p) => {
          const health = fields ? p.fields[fields.spiritual_health]?.value : null;
          const elder = fields ? p.fields[fields.assigned_elder]?.value : null;
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
