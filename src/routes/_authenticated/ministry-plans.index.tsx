import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import {
  listMyPlans,
  createPlan,
  deletePlan,
  MINISTRY_AREAS,
  type MinistryArea,
} from "@/lib/ministry-plans.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { Plus, Trash2, ClipboardList, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ministry-plans/")({
  head: () => ({ meta: [{ title: "Ministry Plans" }] }),
  component: MinistryPlansIndex,
});

function MinistryPlansIndex() {
  const list = useServerFn(listMyPlans);
  const create = useServerFn(createPlan);
  const del = useServerFn(deletePlan);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const isStaffPastor = hasRole("core");

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["ministry-plans", "mine"],
    queryFn: () => list(),
  });

  const currentYear = new Date().getFullYear();
  const [open, setOpen] = useState(false);
  const [area, setArea] = useState<MinistryArea | "">("");
  const [year, setYear] = useState<number>(currentYear);

  const createMut = useMutation({
    mutationFn: () =>
      create({
        data: {
          leader_name: "",
          ministry_area: area as MinistryArea,
          calendar_year: year,
        },
      }),
    onSuccess: (res) => {
      setOpen(false);
      setArea("");
      qc.invalidateQueries({ queryKey: ["ministry-plans"] });
      if (res.existed) toast.info("Loading your existing plan for that area & year.");
      navigate({ to: "/ministry-plans/$planId", params: { planId: res.id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create plan"),
  });

  const deleteMut = useMutation({
    mutationFn: (planId: string) => del({ data: { planId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ministry-plans"] });
      toast.success("Plan deleted");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete"),
  });

  const yearOptions = useMemo(() => {
    const out: number[] = [];
    for (let y = currentYear - 1; y <= currentYear + 2; y++) out.push(y);
    return out;
  }, [currentYear]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-display font-bold flex items-center gap-2">
              <ClipboardList className="h-6 w-6" /> Ministry Plans
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your annual Ministry Action Plans.
            </p>
          </div>
          <div className="flex gap-2">
            {isStaffPastor && (
              <Button variant="outline" asChild>
                <Link to="/ministry-plans/admin">
                  <ShieldCheck className="h-4 w-4" /> Admin view
                </Link>
              </Button>
            )}
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" /> New plan
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New Ministry Action Plan</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Ministry area</Label>
                    <Select
                      value={area}
                      onValueChange={(v) => setArea(v as MinistryArea)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select area" />
                      </SelectTrigger>
                      <SelectContent>
                        {MINISTRY_AREAS.map((a) => (
                          <SelectItem key={a} value={a}>
                            {a}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Calendar year</Label>
                    <Select
                      value={String(year)}
                      onValueChange={(v) => setYear(Number(v))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {yearOptions.map((y) => (
                          <SelectItem key={y} value={String(y)}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    disabled={!area || createMut.isPending}
                    onClick={() => createMut.mutate()}
                  >
                    Create draft
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : plans.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No plans yet. Click "New plan" to start one.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {plans.map((p) => (
              <Card key={p.id} className="hover:border-primary/40 transition-colors">
                <CardContent className="py-4 flex items-center justify-between gap-3 flex-wrap">
                  <Link
                    to={
                      p.status === "draft"
                        ? "/ministry-plans/$planId"
                        : "/ministry-plans/$planId/review"
                    }
                    params={{ planId: p.id }}
                    className="flex-1 min-w-0"
                  >
                    <div className="font-medium">
                      {p.ministry_area ?? "Untitled"} — {p.calendar_year}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Updated {new Date(p.updated_at).toLocaleDateString()}
                    </div>
                  </Link>
                  <StatusBadge status={p.status} />
                  {p.status === "draft" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Delete this draft plan?")) deleteMut.mutate(p.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    submitted: "bg-blue-100 text-blue-800",
    under_review: "bg-amber-100 text-amber-800",
    approved: "bg-green-100 text-green-800",
  };
  return <Badge className={map[status]}>{status.replace("_", " ")}</Badge>;
}
