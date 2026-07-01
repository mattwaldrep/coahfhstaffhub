import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarClock, ClipboardCheck, Wallet, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/annual-planning/")({
  head: () => ({ meta: [{ title: "Annual Planning" }] }),
  component: AnnualPlanningHub,
});

const TILES = [
  {
    to: "/calendar/planning",
    label: "Annual Calendar Submission",
    desc: "Submit ministry events for the upcoming year. Approved items feed the church calendar.",
    icon: CalendarClock,
  },
  {
    to: "/ministry-plans",
    label: "Annual Plan Submission",
    desc: "Complete your Ministry Action Plan: purpose, programs, structure, SWOT, and goals.",
    icon: ClipboardCheck,
  },
  {
    to: "/annual-planning/budget",
    label: "Annual Budget Submission",
    desc: "Submit your ministry's annual budget request. (Coming soon)",
    icon: Wallet,
    disabled: true,
  },
] as Array<{ to: string; label: string; desc: string; icon: typeof Wallet; disabled?: boolean }>;

function AnnualPlanningHub() {
  return (
    <AppShell>
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          Three annual submissions from every ministry area. Calendar submissions
          feed the church calendar once approved.
        </p>
        <div className="grid gap-3 md:grid-cols-1">
          {TILES.map((tile) => {
            const Icon = tile.icon;
            const inner = (
              <Card className={tile.disabled ? "opacity-60" : "hover:bg-muted/40 transition-colors cursor-pointer"}>
                <CardContent className="p-5 flex items-start gap-4">
                  <div className="rounded-md bg-primary/10 p-3">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold flex items-center gap-2">
                      {tile.label}
                      {tile.disabled && (
                        <span className="text-[10px] uppercase tracking-wide bg-muted px-2 py-0.5 rounded">
                          Coming soon
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">{tile.desc}</div>
                  </div>
                  {!tile.disabled && <ArrowRight className="h-4 w-4 text-muted-foreground mt-2" />}
                </CardContent>
              </Card>
            );
            if (tile.disabled) return <div key={tile.label}>{inner}</div>;
            return (
              <Link key={tile.label} to={tile.to} className="block">
                {inner}
              </Link>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
