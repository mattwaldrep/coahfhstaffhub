import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  ArrowRight,
  Settings,
  FileUp,
  Link as LinkIcon,
  MessageSquare,
  CheckCircle2,
  Clock,
} from "lucide-react";
import {
  getCurrentCycle,
  listSubmissionsForCycle,
  listMySubmissions,
  type BudgetSubmission,
} from "@/lib/annual-budget.functions";
import { useAuth } from "@/lib/auth-context";
import { fiscalYearRangeLabel } from "@/lib/fiscal-year";
import { format } from "date-fns";

export const Route = createFileRoute("/annual-planning/budget")({
  head: () => ({ meta: [{ title: "Annual Budget" }] }),
  component: BudgetOverview,
});

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "neutral" | "progress" | "done" | "warn";
}) {
  const cls = {
    neutral: "bg-muted text-muted-foreground",
    progress: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    done: "bg-green-500/15 text-green-700 dark:text-green-300",
    warn: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${cls}`}>
      {label}
    </span>
  );
}

function reportStatus(s: BudgetSubmission) {
  return s.spending_report_uploaded_at
    ? { label: "Uploaded", tone: "done" as const }
    : { label: "Pending", tone: "warn" as const };
}
function roughStatus(s: BudgetSubmission) {
  if (s.rough_status === "submitted") return { label: "Submitted", tone: "done" as const };
  if (s.rough_status === "in_progress") return { label: "In progress", tone: "progress" as const };
  return { label: "Not started", tone: "neutral" as const };
}
function sheetStatus(s: BudgetSubmission) {
  const map: Record<string, { label: string; tone: "neutral" | "progress" | "done" | "warn" }> = {
    awaiting_link: { label: "Awaiting link", tone: "neutral" },
    in_progress: { label: "In progress", tone: "progress" },
    submitted: { label: "Submitted", tone: "done" },
    feedback_provided: { label: "Feedback sent", tone: "progress" },
    revised: { label: "Revised", tone: "done" },
  };
  return map[s.sheet_status] ?? { label: s.sheet_status, tone: "neutral" };
}
function feedbackStatus(s: BudgetSubmission) {
  return s.feedback_submitted_at
    ? { label: "Sent", tone: "done" as const }
    : { label: "—", tone: "neutral" as const };
}

function BudgetOverview() {
  const { hasRole } = useAuth();
  const isCore = hasRole("core");
  const getCycle = useServerFn(getCurrentCycle);
  const listCycleSubs = useServerFn(listSubmissionsForCycle);
  const listMine = useServerFn(listMySubmissions);

  const { data: cycle } = useQuery({
    queryKey: ["budget-cycle", "current"],
    queryFn: () => getCycle(),
  });

  const { data: coreSubs = [] } = useQuery({
    queryKey: ["budget-submissions", cycle?.id, "core"],
    queryFn: () => listCycleSubs({ data: { cycleId: cycle!.id } }),
    enabled: isCore && !!cycle?.id,
  });

  const { data: mySubs = [] } = useQuery({
    queryKey: ["budget-submissions", "mine"],
    queryFn: () => listMine(),
    enabled: !isCore,
  });

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/annual-planning">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back to Annual Planning
              </Link>
            </Button>
            <h1 className="text-2xl font-display font-bold">Annual Budget</h1>
            {cycle && (
              <p className="text-sm text-muted-foreground">
                FY {cycle.fiscal_year} · {fiscalYearRangeLabel(cycle.fiscal_year)} ·{" "}
                <span className="capitalize">{cycle.status.replace("_", " ")}</span>
                {cycle.rough_due_date && (
                  <>
                    {" · Rough due "}
                    {format(new Date(cycle.rough_due_date + "T00:00:00"), "MMM d, yyyy")}
                  </>
                )}
              </p>
            )}
          </div>
          {isCore && (
            <Button asChild variant="outline" size="sm">
              <Link to="/annual-planning/budget/admin">
                <Settings className="h-4 w-4 mr-1" /> Manage cycle
              </Link>
            </Button>
          )}
        </div>

        {!cycle && (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No active budget cycle yet.{" "}
              {isCore ? (
                <Link className="underline" to="/annual-planning/budget/admin">
                  Open one from the admin page.
                </Link>
              ) : (
                <>You'll be notified when the process opens.</>
              )}
            </CardContent>
          </Card>
        )}

        {isCore && cycle && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ministry</TableHead>
                    <TableHead>Leader</TableHead>
                    <TableHead>Report</TableHead>
                    <TableHead>Rough</TableHead>
                    <TableHead>Sheet</TableHead>
                    <TableHead>Feedback</TableHead>
                    <TableHead className="text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coreSubs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                        No submissions yet. Assign ministry leaders in the admin page.
                      </TableCell>
                    </TableRow>
                  )}
                  {coreSubs.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.ministry_area}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {s.author_name ?? "—"}
                      </TableCell>
                      <TableCell><StatusPill {...reportStatus(s)} /></TableCell>
                      <TableCell><StatusPill {...roughStatus(s)} /></TableCell>
                      <TableCell><StatusPill {...sheetStatus(s)} /></TableCell>
                      <TableCell><StatusPill {...feedbackStatus(s)} /></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link
                            to="/annual-planning/budget/$submissionId"
                            params={{ submissionId: s.id }}
                          >
                            Open <ArrowRight className="h-3 w-3 ml-1" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {!isCore && (
          <div className="grid gap-3">
            {mySubs.length === 0 && (
              <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">
                  You don't have any budget submissions yet.
                </CardContent>
              </Card>
            )}
            {mySubs.map((s) => (
              <Card key={s.id}>
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">
                      {s.ministry_area}{" "}
                      <span className="text-xs text-muted-foreground">FY {s.fiscal_year}</span>
                    </div>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <StatusPill {...reportStatus(s)} />
                      <StatusPill {...roughStatus(s)} />
                      <StatusPill {...sheetStatus(s)} />
                      {s.feedback_submitted_at && (
                        <StatusPill label="Feedback available" tone="progress" />
                      )}
                    </div>
                  </div>
                  <Button asChild size="sm">
                    <Link
                      to="/annual-planning/budget/$submissionId"
                      params={{ submissionId: s.id }}
                    >
                      Open <ArrowRight className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card>
          <CardContent className="p-4 text-xs text-muted-foreground grid gap-2">
            <div className="flex items-center gap-2"><FileUp className="h-3 w-3" /> March 1: 12-month spending report uploaded per ministry.</div>
            <div className="flex items-center gap-2"><Clock className="h-3 w-3" /> March 31: Rough budget request + 10k-ft plan due.</div>
            <div className="flex items-center gap-2"><LinkIcon className="h-3 w-3" /> April 1: Google Sheet link posted per ministry.</div>
            <div className="flex items-center gap-2"><MessageSquare className="h-3 w-3" /> Feedback loop until sign-off.</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3" /> 10k-ft plan seeds your Ministry Action Plan later in the year.</div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
