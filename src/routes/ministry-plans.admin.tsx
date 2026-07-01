import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import {
  listAllPlans,
  MINISTRY_AREAS,
  type MinistryArea,
  type PlanStatus,
} from "@/lib/ministry-plans.functions";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { format } from "date-fns";

export const Route = createFileRoute("/ministry-plans/admin")({
  head: () => ({ meta: [{ title: "Ministry Plans — Admin" }] }),
  component: MinistryPlansAdmin,
});

function MinistryPlansAdmin() {
  const { hasRole, loading } = useAuth();
  const navigate = useNavigate();
  const isStaffPastor = hasRole("core");
  const list = useServerFn(listAllPlans);

  useEffect(() => {
    if (!loading && !isStaffPastor) navigate({ to: "/ministry-plans" });
  }, [loading, isStaffPastor, navigate]);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["ministry-plans", "all"],
    queryFn: () => list(),
    enabled: isStaffPastor,
  });

  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = useMemo(
    () =>
      plans.filter(
        (p) =>
          (areaFilter === "all" || p.ministry_area === areaFilter) &&
          (statusFilter === "all" || p.status === statusFilter),
      ),
    [plans, areaFilter, statusFilter],
  );

  if (!isStaffPastor) return null;

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <Link
            to="/ministry-plans"
            className="text-xs text-muted-foreground hover:underline"
          >
            ← My plans
          </Link>
          <h1 className="text-2xl font-display font-bold mt-1">
            All Ministry Plans
          </h1>
          <p className="text-sm text-muted-foreground">
            Review and approve plans across all ministry areas.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Ministry area</label>
            <Select value={areaFilter} onValueChange={setAreaFilter}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All areas</SelectItem>
                {MINISTRY_AREAS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="under_review">Under review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                No plans match these filters.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Leader</TableHead>
                    <TableHead>Ministry area</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p: any) => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() =>
                        navigate({
                          to: "/ministry-plans/$planId/review",
                          params: { planId: p.id },
                        })
                      }
                    >
                      <TableCell>{p.leader_name || p.author_name || "—"}</TableCell>
                      <TableCell>{p.ministry_area ?? "—"}</TableCell>
                      <TableCell>{p.calendar_year}</TableCell>
                      <TableCell>
                        <StatusBadge status={p.status} />
                      </TableCell>
                      <TableCell>
                        {p.submitted_at
                          ? format(new Date(p.submitted_at), "MMM d, yyyy")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {format(new Date(p.updated_at), "MMM d, yyyy")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function StatusBadge({ status }: { status: PlanStatus }) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    submitted: "bg-blue-100 text-blue-800",
    under_review: "bg-amber-100 text-amber-800",
    approved: "bg-green-100 text-green-800",
  };
  return <Badge className={map[status]}>{status.replace("_", " ")}</Badge>;
}
