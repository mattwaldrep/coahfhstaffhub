import { createFileRoute } from "@tanstack/react-router";
import { PastoralCareList } from "@/components/pastoral/PastoralCareList";

export const Route = createFileRoute("/elder/pastoral-care")({
  component: PastoralCare,
});

function PastoralCare() {
  return <PastoralCareList variant="page" />;
}
