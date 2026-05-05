import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/meeting")({
  component: MeetingPage,
});

function MeetingPage() {
  return (
    <AppShell>
      <div className="max-w-3xl">
        <h1 className="text-3xl font-display font-bold">Weekly Staff Meeting</h1>
        <p className="text-muted-foreground mt-2">
          Live agenda, real-time collaboration, and AI transcription will live here. The next phase
          wires up the meeting record, action items, and Sunday Review auto-population.
        </p>
        <div className="mt-8 bg-surface border border-border rounded-2xl p-8 text-sm text-muted-foreground">
          Coming next: meeting workspace.
        </div>
      </div>
    </AppShell>
  );
}
