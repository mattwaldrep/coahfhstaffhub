import { createFileRoute, Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/elder")({
  component: ElderLayout,
});

function ElderLayout() {
  return (
    <AppShell>
      <ElderShell />
    </AppShell>
  );
}

const TABS = [
  { to: "/elder", label: "Overview", exact: true },
  { to: "/elder/meetings", label: "Meetings" },
  { to: "/elder/motions", label: "Motions" },
  { to: "/elder/pastoral-care", label: "Pastoral Care" },
  { to: "/elder/archive", label: "Archive" },
  { to: "/elder/settings", label: "Settings" },
];

function ElderShell() {
  const { hasElderHubAccess, hasElderAccess, isDeaconOnly, isFullElder, loading } = useAuth();
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  if (loading) return null;

  if (!hasElderHubAccess) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-3">
        <ShieldAlert className="w-10 h-10 mx-auto text-muted-foreground" />
        <h1 className="text-xl font-display font-semibold">Elder Hub access only</h1>
        <p className="text-sm text-muted-foreground">
          This area is restricted to elders, elder candidates, and deacons.
        </p>
        <Button asChild variant="outline" size="sm"><Link to="/">Back home</Link></Button>
      </div>
    );
  }

  const tabs = isDeaconOnly ? TABS.filter((t) => t.to === "/elder/meetings") : TABS;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3 border-b border-border pb-3">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-[oklch(0.55_0.15_280)] font-semibold">
            Elder Hub
          </div>
          <h1 className="text-2xl font-display font-bold">Eldership</h1>
        </div>
        <div className="text-xs text-muted-foreground">
          {isFullElder ? "Full Elder · Executive Session enabled" : "Elder Candidate · Standard access"}
        </div>
      </div>
      <nav
        className="-mt-3 -mx-4 sm:mx-0 px-4 sm:px-0 flex gap-1 overflow-x-auto sm:flex-wrap sm:border-b sm:border-border scrollbar-none snap-x snap-mandatory"
        aria-label="Eldership sections"
      >
        {tabs.map((t) => {
          const active = t.exact ? pathname === t.to : pathname === t.to || pathname.startsWith(t.to + "/");
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`shrink-0 snap-start px-3 py-2 text-sm whitespace-nowrap rounded-full sm:rounded-none sm:border-b-2 sm:-mb-px transition-colors ${
                active
                  ? "bg-[oklch(0.55_0.15_280)]/10 text-foreground font-medium sm:bg-transparent sm:border-[oklch(0.55_0.15_280)]"
                  : "text-muted-foreground hover:text-foreground sm:border-transparent"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}
