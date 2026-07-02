import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  listCycles,
  openOrGetCycle,
  advanceCycleStatus,
  listLeaderAssignments,
  upsertLeaderAssignment,
  deleteLeaderAssignment,
} from "@/lib/annual-budget.functions";
import { listUsers } from "@/lib/users.functions";
import { MINISTRY_AREAS } from "@/lib/ministry-plans.functions";
import { currentFiscalYear, fiscalYearRangeLabel } from "@/lib/fiscal-year";

export const Route = createFileRoute("/annual-planning/budget/admin")({
  head: () => ({ meta: [{ title: "Budget Admin" }] }),
  component: BudgetAdmin,
});

function BudgetAdmin() {
  const { hasRole, loading } = useAuth();
  const navigate = useNavigate();
  const isCore = hasRole("core");
  const qc = useQueryClient();
  useEffect(() => {
    if (!loading && !isCore) navigate({ to: "/annual-planning/budget" });
  }, [loading, isCore, navigate]);

  const cyclesFn = useServerFn(listCycles);
  const openCycle = useServerFn(openOrGetCycle);
  const advance = useServerFn(advanceCycleStatus);
  const assignmentsFn = useServerFn(listLeaderAssignments);
  const upsertAssignment = useServerFn(upsertLeaderAssignment);
  const deleteAssignment = useServerFn(deleteLeaderAssignment);
  const usersFn = useServerFn(listUsers);

  const { data: cycles = [] } = useQuery({
    queryKey: ["budget-cycles"],
    queryFn: () => cyclesFn(),
    enabled: isCore,
  });
  const { data: assignments = [] } = useQuery({
    queryKey: ["budget-leader-assignments"],
    queryFn: () => assignmentsFn(),
    enabled: isCore,
  });
  const { data: users = [] } = useQuery({
    queryKey: ["all-users-for-budget"],
    queryFn: () => usersFn(),
    enabled: isCore,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["budget-cycles"] });
    qc.invalidateQueries({ queryKey: ["budget-leader-assignments"] });
    qc.invalidateQueries({ queryKey: ["budget-cycle", "current"] });
  };

  const [newUserId, setNewUserId] = useState<string>("");
  const [newArea, setNewArea] = useState<string>(MINISTRY_AREAS[0]);
  const currentFy = currentFiscalYear();
  const [openFy, setOpenFy] = useState<number>(currentFy);

  if (!isCore) return null;

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/annual-planning/budget">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Link>
          </Button>
          <h1 className="text-2xl font-display font-bold">Budget cycle admin</h1>
        </div>

        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="font-semibold">Budget cycles</div>
            <div className="flex items-end gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Open cycle for FY</label>
                <input
                  type="number"
                  value={openFy}
                  onChange={(e) => setOpenFy(Number(e.target.value))}
                  className="border rounded-md px-2 py-1 text-sm w-28 block"
                />
              </div>
              <Button
                size="sm"
                onClick={async () => {
                  await openCycle({ data: { fiscalYear: openFy } });
                  toast.success(`Cycle for FY ${openFy} ready`);
                  invalidate();
                }}
              >
                Open / get cycle
              </Button>
            </div>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>FY</TableHead>
                    <TableHead>Range</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Rough due</TableHead>
                    <TableHead className="w-64">Advance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cycles.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.fiscal_year}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fiscalYearRangeLabel(c.fiscal_year)}
                      </TableCell>
                      <TableCell>
                        <span className="capitalize text-sm">{c.status.replace("_", " ")}</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.rough_due_date ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={c.status}
                          onValueChange={async (status) => {
                            await advance({ data: { cycleId: c.id, status: status as any } });
                            toast.success("Status updated");
                            invalidate();
                          }}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="setup">Setup</SelectItem>
                            <SelectItem value="rough_planning">Rough planning</SelectItem>
                            <SelectItem value="sheet_submission">Sheet submission</SelectItem>
                            <SelectItem value="feedback">Feedback</SelectItem>
                            <SelectItem value="complete">Complete</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                  {cycles.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-4">
                        No cycles yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="font-semibold">Ministry leader assignments</div>
            <p className="text-xs text-muted-foreground">
              When a new cycle opens, a submission row is auto-created for every active
              user + ministry pairing below.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="text-xs text-muted-foreground">User</label>
                <Select value={newUserId} onValueChange={setNewUserId}>
                  <SelectTrigger className="h-9 w-64">
                    <SelectValue placeholder="Pick a user…" />
                  </SelectTrigger>
                  <SelectContent>
                    {users
                      .slice()
                      .sort((a: any, b: any) =>
                        (a.full_name || a.email || "").localeCompare(b.full_name || b.email || ""),
                      )
                      .map((u: any) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.full_name || u.email}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Ministry area</label>
                <Select value={newArea} onValueChange={setNewArea}>
                  <SelectTrigger className="h-9 w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MINISTRY_AREAS.map((a) => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                disabled={!newUserId}
                onClick={async () => {
                  await upsertAssignment({
                    data: { userId: newUserId, ministryArea: newArea as any, active: true },
                  });
                  toast.success("Assignment saved");
                  invalidate();
                }}
              >
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>

            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Leader</TableHead>
                    <TableHead>Ministry</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div className="text-sm">{a.full_name || a.email || a.user_id}</div>
                        {a.email && (
                          <div className="text-xs text-muted-foreground">{a.email}</div>
                        )}
                      </TableCell>
                      <TableCell>{a.ministry_area}</TableCell>
                      <TableCell>
                        <Select
                          value={a.active ? "yes" : "no"}
                          onValueChange={async (v) => {
                            await upsertAssignment({
                              data: {
                                userId: a.user_id,
                                ministryArea: a.ministry_area,
                                active: v === "yes",
                              },
                            });
                            invalidate();
                          }}
                        >
                          <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="yes">Yes</SelectItem>
                            <SelectItem value="no">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={async () => {
                            await deleteAssignment({ data: { assignmentId: a.id } });
                            invalidate();
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {assignments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-4">
                        No assignments yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-xs text-muted-foreground space-y-1">
            <div className="font-semibold text-sm text-foreground">Automation</div>
            <div>• March 1 (pg_cron): opens cycle, seeds submissions, tasks + emails core to upload spending reports.</div>
            <div>• April 1 (pg_cron): advances to sheet phase, reminds core to paste sheet links, nudges leaders still not submitted.</div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
