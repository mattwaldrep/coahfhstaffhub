import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { getNextBestAction, type NextAction } from "@/lib/next-action.functions";

export function NextBestAction() {
  const [action, setAction] = useState<NextAction>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (getNextBestAction as any)()
      .then((res: NextAction) => setAction(res))
      .catch(() => setAction(null))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded || !action || dismissed) return null;

  return (
    <div className="mb-6 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-2xl p-4 flex items-center gap-4 shadow-card">
      <div className="shrink-0 w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
        <Sparkles className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-primary font-semibold">Next best action</div>
        <div className="font-medium truncate">{action.title}</div>
        <div className="text-xs text-muted-foreground truncate">{action.reason}</div>
      </div>
      <Link
        to={action.href}
        className="shrink-0 inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80"
      >
        Go <ArrowRight className="w-4 h-4" />
      </Link>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
