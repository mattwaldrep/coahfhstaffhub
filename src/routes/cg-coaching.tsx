import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { CoachGroupList } from "@/components/cg-coaching/CoachGroupList";

export const Route = createFileRoute("/cg-coaching")({
  component: CgCoachingPage,
});

function CgCoachingPage() {
  return (
    <AppShell>
      <CoachGroupList />
    </AppShell>
  );
}
