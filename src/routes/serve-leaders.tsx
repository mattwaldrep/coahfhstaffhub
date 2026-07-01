import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ServeLeadersList } from "@/components/serve-leaders/ServeLeadersList";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/serve-leaders")({
  component: ServeLeadersPage,
});

function ServeLeadersPage() {
  const { hasServeLeadersHubAccess, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && !hasServeLeadersHubAccess) {
      navigate({ to: "/" });
    }
  }, [loading, hasServeLeadersHubAccess, navigate]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!hasServeLeadersHubAccess) return null;

  return (
    <div className="p-4 md:p-6">
      <ServeLeadersList />
    </div>
  );
}
