import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppShell } from "@/components/AppShell";
import { listWorkflows, launchWorkflow } from "@/lib/onboarding.functions";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { GraduationCap, Plus, Settings2 } from "lucide-react";

export const Route = createFileRoute("/onboarding/")({
  component: OnboardingPage,
});

function OnboardingPage() {
  const { hasRole } = useAuth();
  const isCore = hasRole("core");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listWorkflows);
  const launchFn = useServerFn(launchWorkflow);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"active" | "completed" | "archived">("active");
  const [form, setForm] = useState({
    new_hire_name: "",
    new_hire_email: "",
    hire_type: "onsite" as "onsite" | "remote" | "hybrid",
    start_date: "",
  });

  const { data: workflows = [] } = useQuery({
    queryKey: ["onboarding-workflows"],
    queryFn: () => listFn(),
  });

  const launch = useMutation({
    mutationFn: () =>
      launchFn({
        data: {
          new_hire_name: form.new_hire_name,
          new_hire_email: form.new_hire_email || undefined,
          hire_type: form.hire_type,
          start_date: form.start_date || null,
        },
      }),
    onSuccess: (res: any) => {
      toast.success("Onboarding launched");
      qc.invalidateQueries({ queryKey: ["onboarding-workflows"] });
      setOpen(false);
      setForm({ new_hire_name: "", new_hire_email: "", hire_type: "onsite", start_date: "" });
      navigate({ to: "/onboarding/$workflowId", params: { workflowId: res.id } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = workflows.filter((w: any) =>
    tab === "active" ? w.status === "active" || w.status === "paused" : w.status === tab,
  );

  return (
    <div className="container mx-auto py-6 space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <GraduationCap className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-display font-bold">Staff Onboarding</h1>
            <p className="text-sm text-muted-foreground">
              Launch a tailored onboarding track for every new hire.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isCore && (
            <Button variant="outline" asChild>
              <Link to="/onboarding/templates">
                <Settings2 className="w-4 h-4 mr-2" /> Edit Master Template
              </Link>
            </Button>
          )}
          {isCore && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" /> Launch Onboarding
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Launch Onboarding Track</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>New hire name</Label>
                    <Input
                      value={form.new_hire_name}
                      onChange={(e) => setForm({ ...form, new_hire_name: e.target.value })}
                      placeholder="Jane Doe"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email (optional)</Label>
                    <Input
                      type="email"
                      value={form.new_hire_email}
                      onChange={(e) => setForm({ ...form, new_hire_email: e.target.value })}
                      placeholder="jane@example.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Hire type</Label>
                    <Select
                      value={form.hire_type}
                      onValueChange={(v: any) => setForm({ ...form, hire_type: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="onsite">On-site</SelectItem>
                        <SelectItem value="remote">Remote (auto-skip on-site tasks)</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Start date</Label>
                    <Input
                      type="date"
                      value={form.start_date}
                      onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => launch.mutate()}
                    disabled={!form.new_hire_name.trim() || launch.isPending}
                  >
                    {launch.isPending ? "Launching…" : "Launch"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No {tab} onboarding tracks.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((w: any) => {
            const denom = w.progress.total;
            const pct = denom ? Math.round((w.progress.done / denom) * 100) : 0;
            return (
              <Link
                key={w.id}
                to="/onboarding/$workflowId"
                params={{ workflowId: w.id }}
                className="block"
              >
                <Card className="hover:border-primary transition-colors h-full">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between gap-2">
                      <span className="truncate">{w.new_hire_name}</span>
                      <Badge variant="secondary" className="capitalize">
                        {w.hire_type}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-xs text-muted-foreground">
                      {w.start_date ? `Start: ${w.start_date}` : "No start date"}
                    </div>
                    <Progress value={pct} />
                    <div className="text-xs text-muted-foreground flex justify-between">
                      <span>
                        {w.progress.done} / {denom} done
                      </span>
                      {w.progress.skipped > 0 && <span>{w.progress.skipped} skipped</span>}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
