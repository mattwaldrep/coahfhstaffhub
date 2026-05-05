import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Lock, Trash2, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import {
  listPastoralCare, upsertPastoralEntry, deletePastoralEntry,
  addPastoralUpdate, listPastoralUpdates,
} from "@/server/pastoral-care.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/elder/pastoral-care")({
  component: PastoralCare,
});

function PastoralCare() {
  const { isFullElder } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"active" | "monitoring" | "resolved">("active");
  const [exec, setExec] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try { setRows(await listPastoralCare() as any[]); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const ch = supabase
      .channel("pastoral-care")
      .on("postgres_changes", { event: "*", schema: "public", table: "pastoral_care_entries" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await upsertPastoralEntry({ data: { person_name: name, notes: notes || null, status, executive_session: exec } });
      toast.success("Added");
      setOpen(false); setName(""); setNotes(""); setStatus("active"); setExec(false);
      load();
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-display font-semibold">Pastoral care</h2>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Add entry
        </Button>
      </div>

      <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
        {loading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
        {!loading && rows.length === 0 && <div className="p-6 text-sm text-muted-foreground">No entries.</div>}
        {rows.map((r) => (
          <div key={r.id}>
            <div
              className="flex items-center justify-between px-4 py-3 hover:bg-background/40 cursor-pointer"
              onClick={() => setExpanded(expanded === r.id ? null : r.id)}
            >
              <div>
                <div className="text-sm font-medium flex items-center gap-2">
                  {r.person_name}
                  {r.executive_session && <Lock className="w-3 h-3 text-[oklch(0.55_0.15_280)]" />}
                </div>
                <div className="text-xs text-muted-foreground">
                  Added {format(new Date(r.date_added), "MMM d, yyyy")}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={r.status}
                  onValueChange={async (v) => {
                    await upsertPastoralEntry({ data: { id: r.id, person_name: r.person_name, status: v as any } });
                    load();
                  }}
                >
                  <SelectTrigger className="h-7 w-32 text-xs" onClick={(e) => e.stopPropagation()}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="monitoring">Monitoring</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm("Delete entry?")) return;
                    await deletePastoralEntry({ data: { id: r.id } });
                    load();
                  }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {expanded === r.id && <ExpandedEntry entry={r} isFullElder={isFullElder} />}
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New pastoral care entry</DialogTitle></DialogHeader>
          <form onSubmit={create} className="space-y-4">
            <div className="space-y-2">
              <Label>Person</Label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="monitoring">Monitoring</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isFullElder && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={exec} onChange={(e) => setExec(e.target.checked)} />
                Executive Session (full elders only)
              </label>
            )}
            <DialogFooter><Button type="submit">Add</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ExpandedEntry({ entry, isFullElder }: { entry: any; isFullElder: boolean }) {
  const [updates, setUpdates] = useState<any[]>([]);
  const [body, setBody] = useState("");
  const [exec, setExec] = useState(entry.executive_session);

  async function load() {
    try {
      setUpdates(await listPastoralUpdates({ data: { entry_id: entry.id } }) as any[]);
    } catch { /* noop */ }
  }
  useEffect(() => { load(); }, [entry.id]);

  async function add() {
    if (!body.trim()) return;
    try {
      await addPastoralUpdate({ data: { entry_id: entry.id, body: body.trim(), executive_session: exec } });
      setBody("");
      load();
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  }

  return (
    <div className="px-4 pb-4 bg-background/30 border-t border-border">
      {entry.notes && <div className="text-xs text-muted-foreground mt-3 whitespace-pre-wrap">{entry.notes}</div>}
      <div className="mt-3 space-y-2">
        {updates.map((u) => (
          <div key={u.id} className="text-xs bg-surface border border-border rounded p-2">
            <div className="text-muted-foreground">{format(new Date(u.created_at), "MMM d, yyyy h:mm a")}</div>
            <div className="whitespace-pre-wrap mt-1">{u.body}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2 items-start">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Add update…" className="text-sm" />
        <div className="flex flex-col gap-2">
          {isFullElder && (
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={exec} onChange={(e) => setExec(e.target.checked)} />
              Exec
            </label>
          )}
          <Button size="sm" variant="outline" onClick={add}>
            <MessageSquarePlus className="w-3 h-3 mr-1" /> Post
          </Button>
        </div>
      </div>
    </div>
  );
}
