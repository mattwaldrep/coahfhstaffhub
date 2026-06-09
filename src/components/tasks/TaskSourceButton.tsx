import { useState } from "react";

import { Info, Loader2, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { useServerFn } from "@tanstack/react-start";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getTaskSource, type TaskSource } from "@/lib/task-source.functions";
import { cn } from "@/lib/utils";

interface Props {
  actionItemId: string;
  className?: string;
}

function buildHref(href: string, search?: Record<string, string> | null) {
  if (!search || Object.keys(search).length === 0) return href;
  const params = new URLSearchParams(search);
  return `${href}?${params.toString()}`;
}
  actionItemId: string;
  className?: string;
}

export function TaskSourceButton({ actionItemId, className }: Props) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<TaskSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fetchSource = useServerFn(getTaskSource);

  async function loadIfNeeded(next: boolean) {
    setOpen(next);
    if (next && !source && !loading) {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetchSource({ data: { actionItemId } });
        setSource(res);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load source");
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <Popover open={open} onOpenChange={loadIfNeeded}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Where did this task come from?"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex items-center justify-center w-5 h-5 rounded-full text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors",
            className,
          )}
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm" align="end">
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
          </div>
        )}
        {err && <div className="text-destructive">{err}</div>}
        {source && (
          <div className="space-y-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Source
              </div>
              <div className="font-medium">{source.label}</div>
              {source.detail && (
                <div className="text-xs text-muted-foreground mt-0.5">{source.detail}</div>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Added {format(new Date(source.createdAt), "MMM d, yyyy")}
              {source.createdByName ? ` by ${source.createdByName}` : ""}
            </div>
            {source.href && (
              <a
                href={buildHref(source.href, source.hrefSearch)}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                onClick={() => setOpen(false)}
              >
                Open source <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
