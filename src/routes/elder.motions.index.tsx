import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listMotions, createMotion } from "@/lib/elder-motions.functions";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Gavel, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/elder/motions/")({ component: MotionsPage });

type Motion = Awaited<ReturnType<typeof listMotions>>[number];

function outcomeBadge(m: Motion) {
  if (!m.closed_at) {
    return <Badge variant="outline" className="bg-amber-500/15 text-amber-700 border-amber-500/30">Open</Badge>;
  }
  const map: Record<string, string> = {
    passed: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
    failed: "bg-destructive/15 text-destructive border-destructive/30",
    tied: "bg-muted text-muted-foreground border-border",
  };
  return <Badge variant="outline" className={map[m.outcome] ?? ""}>{m.outcome}</Badge>;
}

function MotionsPage() {
  const { isFullElder } = useAuth();
  const [rows, setRows] = useState<Motion[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 72);
    return d.toISOString().slice(0, 16);
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await listMotions();
      setRows(data);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load motions");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createMotion({
        data: {
          title: title.trim(),
          description: description.trim(),
          deadline_at: new Date(deadline).toISOString(),
        },
      });
      toast.success("Motion opened — elders notified");
      setOpen(false);
      setTitle(""); setDescription("");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  const openMotions = rows.filter((m) => !m.closed_at);
  const closedMotions = rows.filter((m) => m.closed_at);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-display font-semibold">Motions</h2>
          <p className="text-sm text-muted-foreground">
            Send items out for an elder vote between meetings. Simple majority of votes cast at the deadline.
          </p>
        </div>
        {isFullElder && (
          <Button onClick={() => setOpen((o) => !o)}>
            <Plus className="w-4 h-4 mr-1" />{open ? "Cancel" : "New motion"}
          </Button>
        )}
      </div>

      {open && isFullElder && (
        <Card>
          <CardHeader><CardTitle className="text-base">New motion</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} />
              </div>
              <div>
                <Label>Deadline</Label>
                <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} required />
                <p className="text-xs text-muted-foreground mt-1">All full elders will receive an email when this motion opens.</p>
              </div>
              <Button type="submit" disabled={saving}>{saving ? "Opening…" : "Open motion"}</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Open ({openMotions.length})</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : openMotions.length === 0 ? (
          <EmptyState
            icon={Gavel}
            title="No open motions"
            description={isFullElder ? "Start one when you need an async vote." : "Open motions will appear here."}
          />
        ) : (
          <ul className="space-y-2">
            {openMotions.map((m) => <MotionRow key={m.id} m={m} />)}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Closed ({closedMotions.length})</h3>
        {closedMotions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No closed motions yet.</p>
        ) : (
          <ul className="space-y-2">
            {closedMotions.map((m) => <MotionRow key={m.id} m={m} />)}
          </ul>
        )}
      </section>
    </div>
  );
}

function MotionRow({ m }: { m: Motion }) {
  const deadline = new Date(m.deadline_at);
  return (
    <li>
      <Link
        to="/elder/motions/$motionId"
        params={{ motionId: m.id }}
        className="block border rounded-md p-4 bg-card hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{m.title}</span>
              {outcomeBadge(m)}
              {m.my_vote && <Badge variant="secondary">You voted: {m.my_vote}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              by {m.created_by_name || "—"} ·{" "}
              {m.closed_at
                ? `closed ${formatDistanceToNow(new Date(m.closed_at), { addSuffix: true })}`
                : `deadline ${formatDistanceToNow(deadline, { addSuffix: true })} (${deadline.toLocaleString()})`}
            </p>
          </div>
          <div className="text-right text-xs font-mono text-muted-foreground shrink-0">
            {m.closed_at ? (
              <>{m.tally_yes}–{m.tally_no}{m.tally_abstain ? ` (${m.tally_abstain} abst.)` : ""}</>
            ) : (
              <>{m.live_tally.yes}–{m.live_tally.no}{m.live_tally.abstain ? ` (${m.live_tally.abstain} abst.)` : ""}</>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}
