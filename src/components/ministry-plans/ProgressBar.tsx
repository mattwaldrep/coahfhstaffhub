import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type Step = { key: string; label: string };

export function ProgressBar({
  steps,
  current,
  onSelect,
}: {
  steps: Step[];
  current: number;
  onSelect: (idx: number) => void;
}) {
  return (
    <div className="w-full overflow-x-auto">
      <ol className="flex items-center gap-2 min-w-max">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s.key} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSelect(i)}
                className={cn(
                  "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : done
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground hover:bg-muted/70",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                    active
                      ? "bg-primary-foreground/20"
                      : done
                        ? "bg-primary/20"
                        : "bg-background",
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                {s.label}
              </button>
              {i < steps.length - 1 && <span className="h-px w-4 bg-border" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
