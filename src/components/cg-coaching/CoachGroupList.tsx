import { useEffect, useMemo, useState, useCallback } from "react";
import { format } from "date-fns";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  MessageSquare, RefreshCw, Search, Trash2, History, UserCheck, Link as LinkIcon,
  Phone, Mail, Users as UsersIcon, ChevronDown, ChevronUp,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  listCoachGroups, listCoaches, assignCoach,
  logGroupTouchpoint, listGroupTouchpoints, deleteGroupTouchpoint,
  type CoachGroup,
} from "@/lib/cg-coaching.functions";

type SortKey = "name_asc" | "name_desc" | "my_first";

export function CoachGroupList() {
  const { user, isCgCoach } = useAuth();
  const [groups, setGroups] = useState<CoachGroup[]>([]);
  const [coaches, setCoaches] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("my_first");
  const [myOnly, setMyOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      const [res, cs] = await Promise.all([
        listCoachGroups({ data: { refresh } }),
        (listCoaches as any)(),
      ]);
      setConfigured((res as any).configured);
      setGroups(((res as any).groups ?? []) as CoachGroup[]);
      setCoaches(cs ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { if (isCgCoach) load(false); }, [load, isCgCoach]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = groups.filter((g) => !q || g.name.toLowerCase().includes(q));
    if (myOnly && user) arr = arr.filter((g) => g.coach_user_id === user.id);
    arr = [...arr].sort((a, b) => {
      if (sort === "name_asc") return a.name.localeCompare(b.name);
      if (sort === "name_desc") return b.name.localeCompare(a.name);
      // my_first
      const aMine = a.coach_user_id === user?.id ? 0 : 1;
      const bMine = b.coach_user_id === user?.id ? 0 : 1;
      return aMine - bMine || a.name.localeCompare(b.name);
    });
    return arr;
  }, [groups, search, myOnly, sort, user]);

  if (!isCgCoach) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-3">
        <UsersIcon className="w-10 h-10 mx-auto text-muted-foreground" />
        <h1 className="text-xl font-display font-semibold">CG Coach access only</h1>
        <p className="text-sm text-muted-foreground">
          Ask a core admin to tag you as a CG Coach.
        </p>
        <Button asChild variant="outline" size="sm"><Link to="/">Back home</Link></Button>
      </div>
    );
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  if (!configured) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-6">
        <div className="text-sm font-medium">CG Coaching isn't configured yet.</div>
        <p className="text-xs text-muted-foreground mt-1">
          Pick the Planning Center Group Type to use for community groups.
        </p>
        <Link to="/cg-coaching/settings" className="inline-block mt-3 text-xs text-[oklch(0.55_0.15_280)] hover:underline">
          Open CG settings →
        </Link>
      </div>
    );
  }

  async function onAssign(g: CoachGroup, value: string) {
    try {
      await assignCoach({
        data: {
          group_id: g.id,
          group_name: g.name,
          coach_user_id: value === "none" ? null : value,
        },
      });
      toast.success("Coach updated");
      load(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl md:text-3xl font-display font-bold">CG Coaching</h1>
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[oklch(0.55_0.15_280)]/15 text-[oklch(0.55_0.15_280)]">
            Synced from Planning Center
          </span>
        </div>
        <div className="flex flex-col md:flex-row gap-2 md:items-center">
          <div className="relative w-full md:w-48">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search groups…"
              className="h-9 md:h-8 text-sm pl-7 w-full"
            />
          </div>
          <div className="grid grid-cols-2 md:flex gap-2">
            <Button
              size="sm"
              variant={myOnly ? "default" : "outline"}
              onClick={() => setMyOnly((v) => !v)}
              className="h-9 md:h-8 text-xs justify-center"
            >
              <UserCheck className="w-3.5 h-3.5 mr-1" /> My groups
            </Button>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="h-9 md:h-8 md:w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="my_first">My groups first</SelectItem>
                <SelectItem value="name_asc">Name · A → Z</SelectItem>
                <SelectItem value="name_desc">Name · Z → A</SelectItem>
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
      </div>

      <div className="flex items-center justify-end">
        <span className="text-[11px] text-muted-foreground">
          {filtered.length} of {groups.length}
        </span>
      </div>

      <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
        {filtered.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">No groups match.</div>
        )}
        {filtered.map((g) => (
          <GroupRow
            key={g.id}
            group={g}
            coaches={coaches}
            expanded={expanded === g.id}
            onToggle={() => setExpanded(expanded === g.id ? null : g.id)}
            onAssign={(v) => onAssign(g, v)}
          />
        ))}
      </div>

      <TouchpointLogDialog open={logOpen} onOpenChange={setLogOpen} groups={groups} />
    </div>
  );
}

function GroupRow({
  group, coaches, expanded, onToggle, onAssign,
}: {
  group: CoachGroup;
  coaches: { id: string; name: string }[];
  expanded: boolean;
  onToggle: () => void;
  onAssign: (v: string) => void;
}) {
  const leaders = group.leaders ?? [];
  const phones = leaders.map((l) => l.phone).filter((p): p is string => !!p);
  const smsHref = phones.length
    ? `sms:${phones.join(",")}?&body=${encodeURIComponent(`Hi from your coach,`)}`
    : undefined;

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-3 hover:bg-background/40">
        <button onClick={onToggle} className="flex-1 min-w-0 text-left flex items-center gap-2">
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{group.name}</div>
            <div className="text-xs text-muted-foreground truncate">
              {group.coach_name ? `Coach: ${group.coach_name}` : "No coach assigned"}
              {leaders.length > 0 && ` · ${leaders.length} leader${leaders.length === 1 ? "" : "s"}`}
            </div>
          </div>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={smsHref}
            onClick={(e) => {
              if (!smsHref) {
                e.preventDefault();
                toast.error("No phone numbers on file for these leaders");
                return;
              }
              logGroupTouchpoint({
                data: { group_id: group.id, group_name: group.name, kind: "text" },
              }).catch(() => {});
            }}
            className={`text-xs inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border ${
              smsHref
                ? "border-[oklch(0.55_0.15_280)]/30 text-[oklch(0.55_0.15_280)] hover:bg-[oklch(0.55_0.15_280)]/10"
                : "border-border text-muted-foreground opacity-60 cursor-not-allowed"
            }`}
            title={smsHref ? `Text ${phones.length} leader${phones.length === 1 ? "" : "s"}` : "No phones on file"}
          >
            <MessageSquare className="w-3.5 h-3.5" /> Text
          </a>
        </div>
      </div>
      {expanded && (
        <GroupPanel group={group} coaches={coaches} onAssign={onAssign} />
      )}
    </div>
  );
}

function GroupPanel({
  group, coaches, onAssign,
}: {
  group: CoachGroup;
  coaches: { id: string; name: string }[];
  onAssign: (v: string) => void;
}) {
  const [kind, setKind] = useState<"text" | "call" | "email" | "in_person" | "other">("call");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listGroupTouchpoints({ data: { group_id: group.id, limit: 50 } });
      setRows(r as any[]);
    } catch { /* noop */ }
    finally { setLoading(false); }
  }, [group.id]);

  useEffect(() => { load(); }, [load]);

  async function post() {
    if (!note.trim() && kind !== "text") return;
    setSaving(true);
    try {
      await logGroupTouchpoint({
        data: { group_id: group.id, group_name: group.name, kind, note: note.trim() || null },
      });
      setNote("");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  const kindLabel: Record<string, string> = {
    text: "Text", call: "Call", email: "Email", in_person: "In person", other: "Other",
  };

  return (
    <div className="px-4 pb-4 bg-background/30 border-t border-border space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Assigned coach:</span>
          <Select value={group.coach_user_id ?? "none"} onValueChange={onAssign}>
            <SelectTrigger className="h-7 w-44 text-xs"><SelectValue placeholder="Unassigned" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Unassigned —</SelectItem>
              {coaches.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <a
          href={`https://groups.planningcenteronline.com/groups/${group.id}`}
          target="_blank" rel="noreferrer"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border sm:ml-auto"
        >
          <LinkIcon className="w-3.5 h-3.5" /> Open in PCO
        </a>
      </div>

      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Leaders</div>
        {group.leaders.length === 0 ? (
          <div className="text-xs text-muted-foreground">No leaders found.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {group.leaders.map((l) => (
              <div key={l.person_id} className="text-xs bg-surface border border-border rounded p-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{l.name}</div>
                  <div className="text-muted-foreground truncate">{l.phone ?? "No phone"}</div>
                </div>
                {l.phone && (
                  <a
                    href={`sms:${l.phone}`}
                    className="text-[oklch(0.55_0.15_280)] p-1 hover:bg-[oklch(0.55_0.15_280)]/10 rounded"
                    title={`Text ${l.name}`}
                  >
                    <Phone className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Reach-out log</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={kind} onValueChange={(v) => setKind(v as any)}>
            <SelectTrigger className="h-9 sm:h-8 sm:w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="call">Call</SelectItem>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="in_person">In person</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Note (optional)…"
            className="text-sm flex-1"
          />
          <Button size="sm" variant="outline" onClick={post} disabled={saving} className="h-9 sm:h-8">
            <Mail className="w-3.5 h-3.5 mr-1" /> Log
          </Button>
        </div>

        {loading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-xs text-muted-foreground">No reach-outs logged yet.</div>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.id} className="text-xs bg-surface border border-border rounded p-2 flex items-start justify-between gap-2 group">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-background border border-border">
                      {kindLabel[r.kind] ?? r.kind}
                    </span>
                    {format(new Date(r.created_at), "MMM d, yyyy h:mm a")} · {r.user_name}
                  </div>
                  {r.note && <div className="whitespace-pre-wrap mt-1">{r.note}</div>}
                </div>
                <button
                  onClick={async () => {
                    if (!confirm("Delete entry?")) return;
                    try {
                      await deleteGroupTouchpoint({ data: { id: r.id } });
                      setRows((prev) => prev.filter((x) => x.id !== r.id));
                    } catch (e: any) {
                      toast.error(e.message ?? "Failed");
                    }
                  }}
                  className="opacity-60 md:opacity-0 md:group-hover:opacity-100 hover:text-destructive p-1 -m-1 shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TouchpointLogDialog({
  open, onOpenChange, groups,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  groups: CoachGroup[];
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const groupName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const g of groups) m[g.id] = g.name;
    return m;
  }, [groups]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listGroupTouchpoints({ data: { limit: 200 } })
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
          <DialogTitle>Reach-out log</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No reach-outs logged yet.</div>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.id} className="text-xs border border-border rounded p-2 flex items-start justify-between gap-2 group">
                <div className="min-w-0">
                  <div className="font-medium">
                    {groupName[r.group_id] ?? r.group_name ?? "Unknown group"}
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
                    if (!confirm("Delete entry?")) return;
                    try {
                      await deleteGroupTouchpoint({ data: { id: r.id } });
                      setRows((prev) => prev.filter((x) => x.id !== r.id));
                    } catch (e: any) {
                      toast.error(e.message ?? "Failed");
                    }
                  }}
                  className="opacity-60 md:opacity-0 md:group-hover:opacity-100 hover:text-destructive p-1 -m-1 shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
}
