import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth-context";
import { getCgAttendanceGaps, type CgAttendanceGaps } from "@/lib/cg-attendance.functions";
import { cn } from "@/lib/utils";

const fmtDay = (iso: string) => format(new Date(iso + "T12:00:00"), "EEE MMM d");

export function CgAttendanceGapsButton({ refDate, className }: { refDate?: string; className?: string }) {
  const { user } = useAuth();
  const fetchGaps = useServerFn(getCgAttendanceGaps);
  const [data, setData] = useState<CgAttendanceGaps | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const load = async (refresh = false) => {
    setLoading(true);
    try {
      setData(await fetchGaps({ data: { refDate, refresh } }));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, refDate]);

  if (!user || (data && !data.configured)) return null;
  const count = data?.missing.length ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors",
          !data || loading
            ? "border-border text-muted-foreground"
            : data.error
              ? "border-border text-muted-foreground"
              : count > 0
                ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15"
                : "border-border text-muted-foreground hover:bg-muted",
          className,
        )}
      >
        {count > 0 ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
        {!data && loading
          ? "Checking CG attendance…"
          : data?.error
            ? "CG attendance unavailable"
            : count > 0
              ? `${count} CG${count === 1 ? "" : "s"} missing attendance`
              : "All CGs submitted"}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>CG attendance not submitted</SheetTitle>
            <SheetDescription>
              {data ? `${fmtDay(data.start)} – ${fmtDay(data.end)}` : "Previous Sunday – Saturday"}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3 px-4 pb-6">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {data && !data.error ? `${count} of ${data.total_groups} groups` : ""}
              </span>
              <button
                type="button"
                onClick={() => load(true)}
                disabled={loading}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} /> Refresh
              </button>
            </div>
            {data?.error && <p className="text-sm text-destructive">{data.error}</p>}
            {data && !data.error && count === 0 && (
              <p className="text-sm text-muted-foreground">Every group that met this week has submitted attendance.</p>
            )}
            {data?.missing.map((g) => (
              <div key={g.group_id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-sm">{g.group_name}</div>
                  <a
                    href={`https://groups.planningcenteronline.com/groups/${g.group_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Open in Planning Center"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {g.events.map((e) => (
                    <li key={e.id} className="text-xs text-muted-foreground">
                      {e.starts_at ? format(new Date(e.starts_at), "EEE MMM d, h:mm a") : ""} · {e.name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
