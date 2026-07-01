import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Wallet } from "lucide-react";

export const Route = createFileRoute("/annual-planning/budget")({
  head: () => ({ meta: [{ title: "Annual Budget Submission" }] }),
  component: BudgetPlaceholder,
});

function BudgetPlaceholder() {
  return (
    <AppShell>
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/annual-planning">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Annual Planning
          </Link>
        </Button>
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <div className="mx-auto rounded-full bg-primary/10 p-4 w-fit">
              <Wallet className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-xl font-semibold">Annual Budget Submission</h1>
            <p className="text-sm text-muted-foreground">
              This section will collect each ministry's annual budget request.
              We'll wire up the form and workflow in a follow-up.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
