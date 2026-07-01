import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import {
  getPlan,
  setPlanStatus,
  type PlanStatus,
} from "@/lib/ministry-plans.functions";
import { Button } from "@/components/ui/button";
import { ReviewDocument } from "@/components/ministry-plans/ReviewDocument";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/ministry-plans/$planId/review")({
  head: () => ({ meta: [{ title: "Ministry Plan — Review" }] }),
  component: PlanReview,
});

function PlanReview() {
  const { planId } = Route.useParams();
  const { user, hasRole } = useAuth();
  const isStaffPastor = hasRole("core");
  const load = useServerFn(getPlan);
  const setStatus = useServerFn(setPlanStatus);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: plan, isLoading } = useQuery({
    queryKey: ["ministry-plan", planId],
    queryFn: () => load({ data: { planId } }),
  });

  const statusMut = useMutation({
    mutationFn: (status: PlanStatus) => setStatus({ data: { planId, status } }),
    onSuccess: (_r, status) => {
      qc.invalidateQueries({ queryKey: ["ministry-plan", planId] });
      qc.invalidateQueries({ queryKey: ["ministry-plans"] });
      toast.success(`Status set to ${status.replace("_", " ")}`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  if (isLoading || !plan)
    return (
      <AppShell>
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      </AppShell>
    );

  const isOwner = plan.user_id === user?.id;

  return (
    <AppShell>
      <div className="p-4 md:p-6 space-y-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <Link
            to="/ministry-plans"
            className="text-xs text-muted-foreground hover:underline"
          >
            ← All plans
          </Link>
          <div className="flex gap-2">
            {isOwner && plan.status === "draft" && (
              <Button
                variant="outline"
                onClick={() =>
                  navigate({
                    to: "/ministry-plans/$planId",
                    params: { planId },
                  })
                }
              >
                Continue editing
              </Button>
            )}
            {isStaffPastor && (
              <>
                {plan.status !== "under_review" && plan.status !== "draft" && (
                  <Button
                    variant="outline"
                    onClick={() => statusMut.mutate("under_review")}
                  >
                    Mark under review
                  </Button>
                )}
                {plan.status !== "approved" && plan.status !== "draft" && (
                  <Button onClick={() => statusMut.mutate("approved")}>
                    Approve
                  </Button>
                )}
                {plan.status !== "draft" && (
                  <Button
                    variant="ghost"
                    onClick={() => statusMut.mutate("draft")}
                  >
                    Send back to draft
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
        <ReviewDocument
          plan={plan}
          authorName={(plan as any).author_name}
          onEditStep={
            isOwner && plan.status === "draft"
              ? () =>
                  navigate({
                    to: "/ministry-plans/$planId",
                    params: { planId },
                  })
              : undefined
          }
        />
      </div>
    </AppShell>
  );
}
