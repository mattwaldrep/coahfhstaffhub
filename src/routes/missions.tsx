import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/missions")({
  component: MissionsPage,
});

function MissionsPage() {
  return (
    <AppShell>
      <h1 className="text-3xl font-display font-bold">Missions Pipeline</h1>
      <p className="text-muted-foreground mt-2">17-step pipeline, at-risk alerts, and team templates land here next.</p>
      <div className="mt-8 bg-surface border border-border rounded-2xl p-8 text-sm text-muted-foreground">
        Coming next: missions module.
      </div>
    </AppShell>
  );
}
