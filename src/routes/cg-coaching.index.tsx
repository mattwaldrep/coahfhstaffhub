import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { CoachGroupList } from "@/components/cg-coaching/CoachGroupList";

export const Route = createFileRoute("/cg-coaching/")({
  component: CgCoachingIndexPage,
});

function CgCoachingIndexPage() {
  return (
    <AppShell>
      <CoachGroupList />
    </AppShell>
  );
}
