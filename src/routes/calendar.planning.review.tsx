import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { useServerFn } from "@tanstack/react-start";
import {
  getActiveCycle, listSubmissionsForCycle, getSubmission,
  reviewProposedEvent, finalizeSubmissionReview, bulkReviewSubmission,
} from "@/server/calendar.functions";
import { toast } from "sonner";
import { ArrowLeft, Check, X } from "lucide-react";

export const Route = createFileRoute("/calendar/planning/review")({
  component: () => <AppShell><Review /></AppShell>,
});

function Review() {
  const { hasRole } = useAuth();
  const isCore = hasRole("core");
  const fnActive = useServerFn(getActiveCycle);
  const fnSubs = useServerFn(listSubmissionsForCycle);
  const fnGet = useServerFn(getSubmission);
  const fnReview = useServerFn(reviewProposedEvent);
  const fnFinalize = useServerFn(finalizeSubmissionReview);
  const fnBulk = useServerFn(bulkReviewSubmission);

  const [active, setActive] = useState<any>(null);
  const [subs, setSubs] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Record<string, any[]>>({});

  async function load() {
    const a = await fnActive();
    setActive(a);
    if (a) setSubs(await fnSubs({ data: { cycle_id: a.id } }));
  }
  useEffect(() => { load(); }, []);

  async function expand(id: string) {
    if (expanded[id]) { const c = { ...expanded }; delete c[id]; setExpanded(c); return; }
    const { events } = await fnGet({ data: { id } });
    setExpanded({ ...expanded, [id]: events });
  }

  async function decide(eventId: string, decision: "approved" | "rejected", subId: string) {
    await fnReview({ data: { id: eventId, decision } });
    const { events } = await fnGet({ data: { id: subId } });
    setExpanded({ ...expanded, [subId]: events });
    toast.success(decision === "approved" ? "Approved" : "Rejected");
  }

  async function bulk(subId: string, decision: "approved" | "rejected") {
    if (!confirm(`${decision === "approved" ? "Approve" : "Reject"} all events in this submission?`)) return;
    await fnBulk({ data: { submission_id: subId, decision } });
    await fnFinalize({ data: { submission_id: subId } });
    toast.success("Done");
    load();
    if (expanded[subId]) {
      const { events } = await fnGet({ data: { id: subId } });
      setExpanded({ ...expanded, [subId]: events });
    }
  }

  async function finalize(subId: string) {
    await fnFinalize({ data: { submission_id: subId } });
    toast.success("Finalized");
    load();
  }

  if (!isCore) return <div className="text-sm text-muted-foreground">Core role required.</div>;

  const submitted = subs.filter((s) => s.status !== "draft");

  return (
    <>
      <Link to="/calendar/planning"><Button variant="ghost" size="sm" className="mb-3"><ArrowLeft className="w-4 h-4 mr-1.5" /> Back</Button></Link>
      <h1 className="text-3xl font-display font-bold mb-1">Review submissions</h1>
      <p className="text-muted-foreground text-sm mb-6">{active?.title}</p>

      {submitted.length === 0 && (
        <div className="text-sm text-muted-foreground bg-surface border border-border rounded-2xl p-4">
          No submitted plans yet.
        </div>
      )}

      <div className="space-y-3">
        {submitted.map((s: any) => (
          <div key={s.id} className="bg-surface border border-border rounded-2xl">
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="font-medium">{s.sub_calendar.replace(/_/g, " ")} — {s.leader?.full_name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{s.status}</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => expand(s.id)}>{expanded[s.id] ? "Collapse" : "Expand"}</Button>
                <Button size="sm" variant="secondary" onClick={() => bulk(s.id, "approved")}>Approve all</Button>
                <Button size="sm" variant="ghost" onClick={() => bulk(s.id, "rejected")}>Reject all</Button>
                <Button size="sm" onClick={() => finalize(s.id)}>Finalize</Button>
              </div>
            </div>
            {expanded[s.id] && (
              <div className="border-t border-border divide-y divide-border">
                {expanded[s.id].map((e: any) => (
                  <div key={e.id} className="px-4 py-3 flex items-center justify-between gap-2">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{e.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(e.start_at), "EEE, MMM d")}
                        {e.room_needed ? ` · ${e.room_needed}` : ""}
                        {" · "}{e.status}
                      </div>
                    </div>
                    <Button size="sm" variant={e.status === "approved" ? "default" : "secondary"} onClick={() => decide(e.id, "approved", s.id)}>
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant={e.status === "rejected" ? "default" : "ghost"} onClick={() => decide(e.id, "rejected", s.id)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
