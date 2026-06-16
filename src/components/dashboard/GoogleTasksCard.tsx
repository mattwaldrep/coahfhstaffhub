import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { format, formatDistanceToNow } from "date-fns";
import { CheckCircle2, Circle, ArrowUpRight, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";
import { listMyGoogleTasks, type GoogleTaskItem } from "@/lib/google-tasks.functions";

export function GoogleTasksCard() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [tasks, setTasks] = useState<GoogleTaskItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listMyGoogleTasks()
      .then((r) => {
        if (cancelled) return;
        setConnected(r.connected);
        setTasks(r.tasks);
        setError(r.error ?? null);
      })
      .catch((e) => !cancelled && setError(e?.message ?? "Failed to load"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const visible = (showCompleted ? tasks : tasks.filter((t) => t.status === "needsAction")).slice(0, 10);
  const openCount = tasks.filter((t) => t.status === "needsAction").length;

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-display font-semibold flex items-center gap-2">
          <ListTodo className="w-4 h-4 text-muted-foreground" /> My Google Tasks
        </h2>
        {connected && tasks.length > 0 && (
          <span className="text-xs text-muted-foreground">{openCount} open</span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !connected ? (
        <p className="text-sm text-muted-foreground">
          Not connected.{" "}
          <Link to="/settings" className="underline">
            Connect Google Tasks in Settings
          </Link>{" "}
          to see all your tasks here.
        </p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> No Google Tasks found.
        </p>
      ) : (
        <>
          <ul className="space-y-3">
            {visible.map((t) => {
              const dueDate = t.due ? t.due.slice(0, 10) : null;
              const overdue = t.status === "needsAction" && dueDate && dueDate < todayStr;
              const link = t.webViewLink ?? `https://tasks.google.com/`;
              return (
                <li key={`${t.listId}:${t.id}`} className="flex items-start gap-3 text-sm">
                  {t.status === "completed" ? (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-success" />
                  ) : (
                    <Circle
                      className={cn("w-4 h-4 mt-0.5 shrink-0", overdue ? "text-destructive" : "text-muted-foreground")}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        "text-foreground hover:underline truncate block",
                        t.status === "completed" && "line-through text-muted-foreground",
                      )}
                    >
                      {t.title}
                    </a>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span className="truncate">{t.listTitle}</span>
                      {dueDate && (
                        <span className={cn(overdue && "text-destructive font-medium")}>
                          · Due {formatDistanceToNow(new Date(dueDate), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between mt-3">
            <button
              type="button"
              onClick={() => setShowCompleted((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {showCompleted ? "Hide completed" : "Show completed"}
            </button>
            <a
              href="https://tasks.google.com/"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              Open Google Tasks <ArrowUpRight className="w-3 h-3" />
            </a>
          </div>
        </>
      )}
    </div>
  );
}
