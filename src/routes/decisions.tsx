import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Gavel, Plus, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/decisions")({ component: DecisionsPage });

type Outcome = "passed" | "failed" | "tabled" | "pending";
type Decision = {
  id: string;
  title: string;
  motion_text: string | null;
  outcome: Outcome;
  vote_yes: number;
  vote_no: number;
  vote_abstain: number;
  decided_at: string | null;
  notes: string | null;
  meeting_id: string | null;
};

function outcomeColor(o: Outcome) {
  return o === "passed"
    ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
    : o === "failed"
    ? "bg-destructive/15 text-destructive border-destructive/30"
    : o === "tabled"
    ? "bg-amber-500/15 text-amber-700 border-amber-500/30"
    : "bg-muted text-muted-foreground border-border";
}

function DecisionsPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("core") || hasRole("meeting");
  const [rows, setRows] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Outcome | "all">("all");

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [motion, setMotion] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("passed");
  const [yes, setYes] = useState("");
  const [no, setNo] = useState("");
  const [abstain, setAbstain] = useState("");
  const [notes, setNotes] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("decisions")
      .select("*")
      .order("decided_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRows((data ?? []) as Decision[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter((d) => {
      if (filter !== "all" && d.outcome !== filter) return false;
      if (!ql) return true;
      return (
        d.title.toLowerCase().includes(ql) ||
        (d.motion_text ?? "").toLowerCase().includes(ql) ||
        (d.notes ?? "").toLowerCase().includes(ql)
      );
    });
  }, [rows, q, filter]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const { error } = await supabase.from("decisions").insert({
      title: title.trim(),
      motion_text: motion.trim() || null,
      outcome,
      vote_yes: Number(yes) || 0,
      vote_no: Number(no) || 0,
      vote_abstain: Number(abstain) || 0,
      notes: notes.trim() || null,
      decided_at: new Date().toISOString(),
    });
    if (error) return toast.error(error.message);
    setOpen(false);
    setTitle(""); setMotion(""); setOutcome("passed");
    setYes(""); setNo(""); setAbstain(""); setNotes("");
    toast.success("Decision recorded");
    load();
  }

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-display font-bold">Decisions log</h1>
            <p className="text-sm text-muted-foreground">Motions, votes, and outcomes — searchable history.</p>
          </div>
          {canEdit && (
            <Button onClick={() => setOpen((o) => !o)}>
              <Plus className="w-4 h-4 mr-1" />{open ? "Cancel" : "Record decision"}
            </Button>
          )}
        </header>

        {open && canEdit && (
          <Card>
            <CardHeader><CardTitle className="text-base">New decision</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={save} className="space-y-3">
                <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
                <div><Label>Motion</Label><Textarea value={motion} onChange={(e) => setMotion(e.target.value)} rows={3} /></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <Label>Outcome</Label>
                    <Select value={outcome} onValueChange={(v) => setOutcome(v as Outcome)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="passed">Passed</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="tabled">Tabled</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Yes</Label><Input type="number" value={yes} onChange={(e) => setYes(e.target.value)} /></div>
                  <div><Label>No</Label><Input type="number" value={no} onChange={(e) => setNo(e.target.value)} /></div>
                  <div><Label>Abstain</Label><Input type="number" value={abstain} onChange={(e) => setAbstain(e.target.value)} /></div>
                </div>
                <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
                <Button type="submit">Save decision</Button>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search title, motion, notes…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as Outcome | "all")}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All outcomes</SelectItem>
              <SelectItem value="passed">Passed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="tabled">Tabled</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Gavel}
            title="No decisions yet"
            description={canEdit ? "Record your first motion and vote." : "Decisions will appear here once recorded."}
            action={canEdit ? <Button size="sm" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" />Record decision</Button> : undefined}
          />
        ) : (
          <ul className="space-y-3">
            {filtered.map((d) => (
              <li key={d.id} className="border rounded-md p-4 bg-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{d.title}</span>
                      <Badge variant="outline" className={outcomeColor(d.outcome)}>{d.outcome}</Badge>
                    </div>
                    {d.motion_text && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{d.motion_text}</p>}
                    {d.notes && <p className="text-xs text-muted-foreground mt-2 italic">{d.notes}</p>}
                  </div>
                  <div className="text-right text-xs text-muted-foreground shrink-0">
                    {d.decided_at && new Date(d.decided_at).toLocaleDateString()}
                    <div className="mt-1 font-mono">
                      {d.vote_yes}–{d.vote_no}
                      {d.vote_abstain > 0 && <span className="text-muted-foreground/70"> ({d.vote_abstain} abst.)</span>}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
