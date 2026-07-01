import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
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

  if (loading) {
    return (
      <AppShell>
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }
  if (!hasServeLeadersHubAccess) return null;

  return (
    <AppShell>
      <div className="p-4 md:p-6">
        <ServeLeadersList />
      </div>
    </AppShell>
  );
}
