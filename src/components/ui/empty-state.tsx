import { type ReactNode, type ComponentType } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

/**
 * Friendly empty state. Always offer a next step via `action` rather than
 * leaving the user with a dead-end "Nothing here."
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  compact,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-6 gap-2" : "py-10 gap-3",
        className,
      )}
    >
      <div className="rounded-full bg-muted/60 p-3 text-muted-foreground">
        <Icon className={compact ? "w-4 h-4" : "w-5 h-5"} />
      </div>
      <div className="space-y-1">
        <p className="font-medium text-foreground text-sm">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground max-w-sm">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
