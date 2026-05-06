import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getActiveCycle } from "@/server/calendar.functions";

type Cycle = {
  id: string;
  plan_year: number;
  title: string;
  status: "open" | "review" | "closed";
  closes_at: string;
};

export function PlanningBanner() {
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    getActiveCycle()
      .then((c) => {
        if (active) setCycle((c as Cycle | null) ?? null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (cycle) {
      setDismissed(sessionStorage.getItem(`planning-banner-${cycle.id}`) === "1");
    }
  }, [cycle]);

  if (!cycle || dismissed) return null;

  const closes = new Date(cycle.closes_at);
  const daysLeft = Math.max(
    0,
    Math.ceil((closes.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  );

  return (
    <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 flex items-center gap-3">
      <CalendarClock className="w-5 h-5 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">
          {cycle.status === "review" ? "Annual planning in review" : "Annual planning is open"}
          : {cycle.title}
        </div>
        <div className="text-xs text-muted-foreground">
          {cycle.status === "open"
            ? `Submit your sub-calendar plan by ${closes.toLocaleDateString()} (${daysLeft} day${daysLeft === 1 ? "" : "s"} left).`
            : "Reviewers are working through submitted plans."}
        </div>
      </div>
      <Button asChild size="sm" variant="default">
        <Link to="/calendar/planning">
          {cycle.status === "review" ? "View" : "Plan now"}
        </Link>
      </Button>
      <button
        onClick={() => {
          sessionStorage.setItem(`planning-banner-${cycle.id}`, "1");
          setDismissed(true);
        }}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
