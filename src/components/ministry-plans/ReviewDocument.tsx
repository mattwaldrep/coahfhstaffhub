import { format } from "date-fns";
import type { MinistryPlan } from "@/lib/ministry-plans.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

function Section({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between border-b pb-2">
        <h2 className="text-lg font-semibold font-display">{title}</h2>
        {onEdit && (
          <Button type="button" size="sm" variant="ghost" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}

function StatusBadge({ status }: { status: MinistryPlan["status"] }) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    submitted: "bg-blue-100 text-blue-800",
    under_review: "bg-amber-100 text-amber-800",
    approved: "bg-green-100 text-green-800",
  };
  const label = status.replace("_", " ");
  return <Badge className={map[status]}>{label}</Badge>;
}

export function ReviewDocument({
  plan,
  onEditStep,
  authorName,
}: {
  plan: MinistryPlan;
  onEditStep?: (step: number) => void;
  authorName?: string | null;
}) {
  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Ministry Action Plan
          </p>
          <h1 className="text-2xl font-display font-bold">
            {plan.ministry_area ?? "Untitled area"} — {plan.calendar_year}
          </h1>
          <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div>
              <dt className="inline text-muted-foreground">Name: </dt>
              <dd className="inline">{plan.leader_name || authorName || "—"}</dd>
            </div>
            <div>
              <dt className="inline text-muted-foreground">Campus: </dt>
              <dd className="inline">{plan.campus || "—"}</dd>
            </div>
            <div>
              <dt className="inline text-muted-foreground">Department: </dt>
              <dd className="inline">{plan.department || "—"}</dd>
            </div>
            <div>
              <dt className="inline text-muted-foreground">Calendar Year: </dt>
              <dd className="inline">{plan.calendar_year}</dd>
            </div>
          </dl>
        </div>
        <StatusBadge status={plan.status} />
      </div>

      <Section
        title="I. Purpose of Your Ministry Area"
        onEdit={onEditStep ? () => onEditStep(1) : undefined}
      >
        {plan.purpose ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{plan.purpose}</p>
        ) : (
          <p className="text-sm italic text-muted-foreground">Not yet written.</p>
        )}
      </Section>

      <Section
        title="II. Process and Programs"
        onEdit={onEditStep ? () => onEditStep(2) : undefined}
      >
        {plan.programs.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">None listed.</p>
        ) : (
          <div className="grid gap-3">
            {plan.programs.map((p) => (
              <Card key={p.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between gap-3">
                    <span>{p.name || "Untitled program"}</span>
                    {p.cadence && (
                      <span className="text-xs text-muted-foreground font-normal">
                        {p.cadence}
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm whitespace-pre-wrap">
                  {p.description || (
                    <span className="italic text-muted-foreground">
                      No discipleship description.
                    </span>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="III. Organizational Structure"
        onEdit={onEditStep ? () => onEditStep(3) : undefined}
      >
        {plan.org_structure ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {plan.org_structure}
          </p>
        ) : (
          <p className="text-sm italic text-muted-foreground">Not yet described.</p>
        )}
      </Section>

      <Section
        title="IV. SWOT Analysis"
        onEdit={onEditStep ? () => onEditStep(4) : undefined}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <SwotBlock label="Strengths within the ministry" items={plan.strengths} />
          <SwotBlock label="Weaknesses within the ministry" items={plan.weaknesses} />
          <SwotBlock label="Opportunities for the future" items={plan.opportunities} />
          <SwotBlock label="Threats to the health of the ministry" items={plan.threats} />
        </div>
      </Section>

      <Section
        title="V. Goals for the Year · VI. Targeted Completion & Significant Others · VII. Communication and Execution Plan"
        onEdit={onEditStep ? () => onEditStep(5) : undefined}
      >
        {plan.goals.filter((g) => g.goal_statement).length === 0 ? (
          <p className="text-sm italic text-muted-foreground">No goals set.</p>
        ) : (
          <div className="space-y-3">
            {plan.goals
              .filter((g) => g.goal_statement || g.execution_steps.length)
              .map((g, i) => (
                <Card key={g.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      Goal {i + 1}: {g.goal_statement || "(untitled)"}
                    </CardTitle>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-3 mt-1">
                      {g.completion_date && (
                        <span>
                          Target:{" "}
                          {format(new Date(g.completion_date), "MMM d, yyyy")}
                        </span>
                      )}
                      {g.significant_others && (
                        <span>Helped by: {g.significant_others}</span>
                      )}
                    </div>
                  </CardHeader>
                  {g.execution_steps.filter((s) => s.text).length > 0 && (
                    <CardContent className="pt-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                        Communication &amp; execution
                      </p>
                      <ul className="list-disc pl-5 text-sm space-y-1">
                        {g.execution_steps
                          .filter((s) => s.text)
                          .map((s) => (
                            <li key={s.id}>{s.text}</li>
                          ))}
                      </ul>
                    </CardContent>
                  )}
                </Card>
              ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function SwotBlock({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
        {label}
      </p>
      {items.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">None</p>
      ) : (
        <ul className="list-disc pl-5 text-sm space-y-1">
          {items.map((i, idx) => (
            <li key={idx}>{i}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
