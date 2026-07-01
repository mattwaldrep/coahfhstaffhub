import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import {
  getPlan,
  submitPlan,
  MINISTRY_AREAS,
  type MinistryArea,
  type MinistryPlan,
  type ProgramEntry,
  type GoalEntry,
} from "@/lib/ministry-plans.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ProgressBar } from "@/components/ministry-plans/ProgressBar";
import { SaveIndicator } from "@/components/ministry-plans/SaveIndicator";
import { BulletList } from "@/components/ministry-plans/BulletList";
import { useAutosave } from "@/components/ministry-plans/useAutosave";
import { ReviewDocument } from "@/components/ministry-plans/ReviewDocument";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/ministry-plans/$planId")({
  head: () => ({ meta: [{ title: "Ministry Plan" }] }),
  component: PlanEditor,
});

const STEPS = [
  { key: "header", label: "Header" },
  { key: "purpose", label: "I. Purpose" },
  { key: "programs", label: "II. Programs" },
  { key: "structure", label: "III. Structure" },
  { key: "swot", label: "IV. SWOT" },
  { key: "goals", label: "V–VII. Goals" },
  { key: "review", label: "Review" },
];

function uid() {
  return crypto.randomUUID();
}

function ensureGoals(goals: GoalEntry[]): GoalEntry[] {
  const list = [...goals];
  while (list.length < 3) {
    list.push({
      id: uid(),
      goal_statement: "",
      completion_date: null,
      significant_others: "",
      execution_steps: [],
    });
  }
  return list;
}

function PlanEditor() {
  const { planId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const load = useServerFn(getPlan);
  const submit = useServerFn(submitPlan);

  const { data: initialPlan, isLoading } = useQuery({
    queryKey: ["ministry-plan", planId],
    queryFn: () => load({ data: { planId } }),
  });

  const [step, setStep] = useState(0);
  const [plan, setPlan] = useState<MinistryPlan | null>(null);

  useEffect(() => {
    if (initialPlan && !plan) {
      setPlan({ ...initialPlan, goals: ensureGoals(initialPlan.goals) });
    }
  }, [initialPlan, plan]);

  const editable = plan?.status === "draft" && plan.user_id === user?.id;
  const { save, flush, state } = useAutosave(planId, !!editable);

  function patch<K extends keyof MinistryPlan>(
    key: K,
    value: MinistryPlan[K],
    opts?: { debounce?: number },
  ) {
    setPlan((p) => (p ? { ...p, [key]: value } : p));
    save({ [key]: value }, opts);
  }

  const submitMut = useMutation({
    mutationFn: async () => {
      await flush();
      return submit({ data: { planId } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ministry-plan", planId] });
      qc.invalidateQueries({ queryKey: ["ministry-plans"] });
      toast.success("Submitted for review");
      navigate({ to: "/ministry-plans/$planId/review", params: { planId } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Submit failed"),
  });

  if (isLoading || !plan) {
    return (
      <AppShell>
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }

  if (!editable && plan.status !== "draft") {
    // redirect to review
    navigate({ to: "/ministry-plans/$planId/review", params: { planId } });
    return null;
  }

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <Link
              to="/ministry-plans"
              className="text-xs text-muted-foreground hover:underline"
            >
              ← All plans
            </Link>
            <h1 className="text-2xl font-display font-bold">
              {plan.ministry_area ?? "New plan"} — {plan.calendar_year}
            </h1>
          </div>
          <SaveIndicator state={state} />
        </div>

        <ProgressBar steps={STEPS} current={step} onSelect={setStep} />

        <Card>
          <CardContent className="p-4 md:p-6 space-y-4">
            {step === 0 && <HeaderStep plan={plan} patch={patch} />}
            {step === 1 && <PurposeStep plan={plan} patch={patch} />}
            {step === 2 && <ProgramsStep plan={plan} patch={patch} />}
            {step === 3 && <StructureStep plan={plan} patch={patch} />}
            {step === 4 && <SwotStep plan={plan} patch={patch} />}
            {step === 5 && <GoalsStep plan={plan} patch={patch} />}
            {step === 6 && (
              <ReviewDocument plan={plan} onEditStep={(s) => setStep(s)} />
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              disabled={submitMut.isPending}
              onClick={() => submitMut.mutate()}
            >
              Submit for Review
            </Button>
          )}
        </div>
      </div>
    </AppShell>
  );
}

// ------------- STEPS -------------

type PatchFn = <K extends keyof MinistryPlan>(
  key: K,
  value: MinistryPlan[K],
  opts?: { debounce?: number },
) => void;

function HeaderStep({ plan, patch }: { plan: MinistryPlan; patch: PatchFn }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Leader name</Label>
        <Input
          value={plan.leader_name}
          onChange={(e) => patch("leader_name", e.target.value, { debounce: 800 })}
          onBlur={(e) => patch("leader_name", e.target.value, { debounce: 0 })}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Ministry area</Label>
          <Select
            value={plan.ministry_area ?? ""}
            onValueChange={(v) => patch("ministry_area", v as MinistryArea, { debounce: 0 })}
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
          <Input
            type="number"
            value={plan.calendar_year}
            onChange={(e) =>
              patch("calendar_year", Number(e.target.value) || plan.calendar_year, {
                debounce: 800,
              })
            }
            onBlur={(e) =>
              patch("calendar_year", Number(e.target.value) || plan.calendar_year, {
                debounce: 0,
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

function PurposeStep({ plan, patch }: { plan: MinistryPlan; patch: PatchFn }) {
  return (
    <div className="space-y-2">
      <Label>How does your ministry area reflect our mission and vision?</Label>
      <Textarea
        rows={10}
        value={plan.purpose}
        onChange={(e) => patch("purpose", e.target.value, { debounce: 800 })}
        onBlur={(e) => patch("purpose", e.target.value, { debounce: 0 })}
      />
    </div>
  );
}

function ProgramsStep({ plan, patch }: { plan: MinistryPlan; patch: PatchFn }) {
  const flushNow = (next: ProgramEntry[]) => patch("programs", next, { debounce: 0 });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Programs</h3>
          <p className="text-xs text-muted-foreground">
            How each program moves people through our discipleship process.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            flushNow([
              ...plan.programs,
              { id: uid(), name: "", cadence: "", description: "" },
            ])
          }
        >
          <Plus className="h-4 w-4" /> Add program
        </Button>
      </div>
      {plan.programs.length === 0 && (
        <p className="text-sm text-muted-foreground italic">No programs added yet.</p>
      )}
      {plan.programs.map((p, idx) => (
        <Card key={p.id}>
          <CardContent className="p-3 space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                placeholder="Program name"
                defaultValue={p.name}
                onBlur={(e) => {
                  const next = plan.programs.map((x) =>
                    x.id === p.id ? { ...x, name: e.target.value } : x,
                  );
                  flushNow(next);
                }}
              />
              <Input
                placeholder="Cadence (e.g. weekly, monthly)"
                defaultValue={p.cadence}
                onBlur={(e) => {
                  const next = plan.programs.map((x) =>
                    x.id === p.id ? { ...x, cadence: e.target.value } : x,
                  );
                  flushNow(next);
                }}
              />
            </div>
            <Textarea
              rows={3}
              placeholder="How this program moves people through discipleship…"
              defaultValue={p.description}
              onBlur={(e) => {
                const next = plan.programs.map((x) =>
                  x.id === p.id ? { ...x, description: e.target.value } : x,
                );
                flushNow(next);
              }}
            />
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Program {idx + 1}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  flushNow(plan.programs.filter((x) => x.id !== p.id))
                }
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StructureStep({ plan, patch }: { plan: MinistryPlan; patch: PatchFn }) {
  return (
    <div className="space-y-2">
      <Label>Organizational structure</Label>
      <p className="text-xs text-muted-foreground">
        Describe your structure including coaches / leads and volunteers.
      </p>
      <Textarea
        rows={10}
        value={plan.org_structure}
        onChange={(e) => patch("org_structure", e.target.value, { debounce: 800 })}
        onBlur={(e) => patch("org_structure", e.target.value, { debounce: 0 })}
      />
    </div>
  );
}

function SwotStep({ plan, patch }: { plan: MinistryPlan; patch: PatchFn }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(
        [
          ["strengths", "Strengths"],
          ["weaknesses", "Weaknesses"],
          ["opportunities", "Opportunities"],
          ["threats", "Threats"],
        ] as const
      ).map(([key, label]) => (
        <div key={key} className="rounded-md border p-3 space-y-2">
          <Label>{label}</Label>
          <BulletList
            items={plan[key] as string[]}
            onChange={(next) => patch(key, next as any, { debounce: 0 })}
            placeholder={`Add ${label.toLowerCase()}…`}
            editable
          />
        </div>
      ))}
    </div>
  );
}

function GoalsStep({ plan, patch }: { plan: MinistryPlan; patch: PatchFn }) {
  const update = (next: GoalEntry[]) => patch("goals", next, { debounce: 0 });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Goals</h3>
          <p className="text-xs text-muted-foreground">
            Add as many goals as needed. Click a goal to expand it.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            update([
              ...plan.goals,
              {
                id: uid(),
                goal_statement: "",
                completion_date: null,
                significant_others: "",
                execution_steps: [],
              },
            ])
          }
        >
          <Plus className="h-4 w-4" /> Add goal
        </Button>
      </div>
      <Accordion type="multiple" className="space-y-2">
        {plan.goals.map((g, i) => (
          <AccordionItem
            key={g.id}
            value={g.id}
            className="rounded-md border px-3"
          >
            <AccordionTrigger className="hover:no-underline">
              <span className="text-left text-sm">
                Goal {i + 1}
                {g.goal_statement ? `: ${g.goal_statement}` : ""}
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <Label>Goal statement</Label>
                <Input
                  defaultValue={g.goal_statement}
                  onBlur={(e) =>
                    update(
                      plan.goals.map((x) =>
                        x.id === g.id ? { ...x, goal_statement: e.target.value } : x,
                      ),
                    )
                  }
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Completion date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !g.completion_date && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {g.completion_date
                          ? format(new Date(g.completion_date), "PPP")
                          : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={g.completion_date ? new Date(g.completion_date) : undefined}
                        onSelect={(d) =>
                          update(
                            plan.goals.map((x) =>
                              x.id === g.id
                                ? {
                                    ...x,
                                    completion_date: d
                                      ? d.toISOString().slice(0, 10)
                                      : null,
                                  }
                                : x,
                            ),
                          )
                        }
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1.5">
                  <Label>Significant others</Label>
                  <Input
                    placeholder="Who's helping achieve it?"
                    defaultValue={g.significant_others}
                    onBlur={(e) =>
                      update(
                        plan.goals.map((x) =>
                          x.id === g.id
                            ? { ...x, significant_others: e.target.value }
                            : x,
                        ),
                      )
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Execution / communication steps</Label>
                <BulletList
                  items={g.execution_steps.map((s) => s.text)}
                  onChange={(next) =>
                    update(
                      plan.goals.map((x) =>
                        x.id === g.id
                          ? {
                              ...x,
                              execution_steps: next.map((t, idx) => ({
                                id: g.execution_steps[idx]?.id ?? uid(),
                                text: t,
                              })),
                            }
                          : x,
                      ),
                    )
                  }
                  placeholder="Add a step…"
                  editable
                />
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => update(plan.goals.filter((x) => x.id !== g.id))}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove goal
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
