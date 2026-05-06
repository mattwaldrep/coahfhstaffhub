import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { useServerFn } from "@tanstack/react-start";
import {
  listPlanningCycles, getActiveCycle, createPlanningCycle, updatePlanningCycle,
  listSubmissionsForCycle, createSubmission,
} from "@/server/calendar.functions";
import { toast } from "sonner";
import { CalendarDays, Plus, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/calendar_/planning")({
  component: () => <AppShell><PlanningHome /></AppShell>,
});

const SUB_CALS = [
  { value: "forest_hills_main", label: "Forest Hills Main" },
  { value: "coah_lm", label: "COAH:LM" },
  { value: "youth", label: "Youth" },
  { value: "general", label: "General" },
];

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_review: "In review",
  approved: "Approved",
  partially_approved: "Partial",
  rejected: "Rejected",
};

function PlanningHome() {
  const { user, hasRole } = useAuth();
  const isCore = hasRole("core");
  const fnList = useServerFn(listPlanningCycles);
  const fnActive = useServerFn(getActiveCycle);
  const fnCreate = useServerFn(createPlanningCycle);
  const fnUpdate = useServerFn(updatePlanningCycle);
  const fnSubs = useServerFn(listSubmissionsForCycle);
  const fnCreateSub = useServerFn(createSubmission);

  const [cycles, setCycles] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [openNew, setOpenNew] = useState(false);
  const [openCycle, setOpenCycle] = useState(false);
  const [newSubCal, setNewSubCal] = useState("general");
  const [newCycleYear, setNewCycleYear] = useState(new Date().getFullYear() + 1);
  const [newCycleTitle, setNewCycleTitle] = useState("");
  const [newCycleOpens, setNewCycleOpens] = useState("");
  const [newCycleCloses, setNewCycleCloses] = useState("");

  async function load() {
    const [allCycles, act] = await Promise.all([fnList(), fnActive()]);
    setCycles(allCycles);
    setActive(act);
    if (act) {
      const subs = await fnSubs({ data: { cycle_id: act.id } });
      setSubmissions(subs);
    } else {
      setSubmissions([]);
    }
  }

  useEffect(() => { load(); }, []);

  const mySubs = submissions.filter((s: any) => s.leader_id === user?.id);
  const otherSubs = submissions.filter((s: any) => s.leader_id !== user?.id && s.status !== "draft");

  async function createMySub() {
    if (!active) return;
    try {
      const sub = await fnCreateSub({ data: { cycle_id: active.id, sub_calendar: newSubCal as any } });
      toast.success("Plan started");
      setOpenNew(false);
      window.location.href = `/calendar/planning/${sub.id}`;
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function createCycle() {
    try {
      await fnCreate({
        data: {
          plan_year: newCycleYear,
          title: newCycleTitle || `${newCycleYear} Annual Planning`,
          opens_at: newCycleOpens,
          closes_at: newCycleCloses,
        },
      });
      toast.success("Planning cycle opened");
      setOpenCycle(false);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Annual Calendar Planning</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Plan your ministry's year together. Submitted plans are visible to all staff to prevent overlap.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/calendar"><Button variant="ghost" size="sm"><CalendarDays className="w-4 h-4 mr-1.5" /> Master calendar</Button></Link>
          {isCore && (
            <>
              <Link to="/calendar/planning/review"><Button variant="secondary" size="sm">Review submissions</Button></Link>
              <Button size="sm" onClick={() => setOpenCycle(true)}>
                <Plus className="w-4 h-4 mr-1.5" /> New cycle
              </Button>
            </>
          )}
        </div>
      </div>

      {!active && (
        <div className="rounded-2xl border border-border p-6 bg-surface text-sm text-muted-foreground">
          No active planning cycle. {isCore ? "Open one with 'New cycle' above." : "An admin will open one when planning begins."}
        </div>
      )}

      {active && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border p-5 bg-surface">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="font-display text-xl">{active.title}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Open {format(parseISO(active.opens_at), "MMM d")} → close {format(parseISO(active.closes_at), "MMM d, yyyy")}
                  {" · "}status: {active.status}
                </div>
              </div>
              {isCore && (
                <div className="flex gap-2">
                  {active.status === "open" && (
                    <Button size="sm" variant="secondary" onClick={async () => { await fnUpdate({ data: { id: active.id, status: "review" }}); toast.success("Cycle moved to review"); load(); }}>Move to review</Button>
                  )}
                  {active.status !== "closed" && (
                    <Button size="sm" variant="ghost" onClick={async () => { await fnUpdate({ data: { id: active.id, status: "closed" }}); toast.success("Cycle closed"); load(); }}>Close cycle</Button>
                  )}
                </div>
              )}
            </div>
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg">My plans</h2>
              <Button size="sm" onClick={() => setOpenNew(true)}>
                <Plus className="w-4 h-4 mr-1.5" /> Start a plan
              </Button>
            </div>
            {mySubs.length === 0 && (
              <div className="text-sm text-muted-foreground">You haven't started a plan yet.</div>
            )}
            <div className="space-y-2">
              {mySubs.map((s: any) => (
                <Link key={s.id} to="/calendar/planning/$submissionId" params={{ submissionId: s.id }}>
                  <div className="flex items-center justify-between bg-surface border border-border rounded-2xl px-4 py-3 hover:border-primary transition">
                    <div>
                      <div className="font-medium">{SUB_CALS.find(c => c.value === s.sub_calendar)?.label ?? s.sub_calendar}</div>
                      <div className="text-xs text-muted-foreground">{STATUS_LABEL[s.status]}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-lg">Other ministries' plans</h2>
            <p className="text-xs text-muted-foreground">Read-only — coordinate with leaders to avoid conflicts.</p>
            {otherSubs.length === 0 && (
              <div className="text-sm text-muted-foreground">No submissions from others yet.</div>
            )}
            <div className="space-y-2">
              {otherSubs.map((s: any) => (
                <Link key={s.id} to="/calendar/planning/$submissionId" params={{ submissionId: s.id }}>
                  <div className="flex items-center justify-between bg-surface border border-border rounded-2xl px-4 py-3 hover:border-primary transition">
                    <div>
                      <div className="font-medium">{SUB_CALS.find(c => c.value === s.sub_calendar)?.label ?? s.sub_calendar}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.leader?.full_name ?? s.leader?.email ?? "—"} · {STATUS_LABEL[s.status]}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {cycles.length > 1 && (
            <section className="space-y-2">
              <h2 className="font-display text-lg">Past cycles</h2>
              {cycles.filter((c) => c.id !== active.id).map((c: any) => (
                <div key={c.id} className="text-sm text-muted-foreground bg-surface border border-border rounded-xl px-4 py-2">
                  {c.title} — {c.status}
                </div>
              ))}
            </section>
          )}
        </div>
      )}

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>Start a new plan</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Sub-calendar</Label>
            <Select value={newSubCal} onValueChange={setNewSubCal}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUB_CALS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button onClick={createMySub}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openCycle} onOpenChange={setOpenCycle}>
        <DialogContent>
          <DialogHeader><DialogTitle>Open a planning cycle</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Year</Label>
              <Input type="number" value={newCycleYear} onChange={(e) => setNewCycleYear(parseInt(e.target.value) || 0)} />
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input placeholder={`${newCycleYear} Annual Planning`} value={newCycleTitle} onChange={(e) => setNewCycleTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Opens</Label>
                <Input type="date" value={newCycleOpens} onChange={(e) => setNewCycleOpens(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Closes</Label>
                <Input type="date" value={newCycleCloses} onChange={(e) => setNewCycleCloses(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={createCycle}>Open cycle</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
