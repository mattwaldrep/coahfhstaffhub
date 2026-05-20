import { useCallback, useRef } from "react";
import { toast } from "sonner";

interface UndoableOptions<T> {
  /** Apply the change optimistically (e.g. remove from list). */
  optimistic: () => T;
  /** Roll back if undone or commit fails. Receives the snapshot returned by optimistic(). */
  rollback: (snapshot: T) => void;
  /** Persist the change after the undo window expires. */
  commit: () => Promise<void>;
  /** Toast message shown with the Undo button. */
  message: string;
  /** Description below the toast (optional). */
  description?: string;
  /** Undo window in ms. Defaults to 5000. */
  durationMs?: number;
}

/**
 * Run a destructive action optimistically with a 5-second Undo toast.
 * If the user clicks Undo the change is rolled back and never persisted.
 * If the toast expires the change is committed; commit errors auto-revert.
 */
export function useUndoableAction() {
  // Track active timers so unmount cancels pending commits.
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  return useCallback(<T,>(opts: UndoableOptions<T>) => {
    const snapshot = opts.optimistic();
    let undone = false;

    const timer = setTimeout(async () => {
      timersRef.current.delete(timer);
      if (undone) return;
      try {
        await opts.commit();
      } catch (err) {
        opts.rollback(snapshot);
        toast.error("Couldn't save change", {
          description: err instanceof Error ? err.message : "Please try again.",
        });
      }
    }, opts.durationMs ?? 5000);
    timersRef.current.add(timer);

    toast(opts.message, {
      description: opts.description,
      duration: opts.durationMs ?? 5000,
      action: {
        label: "Undo",
        onClick: () => {
          undone = true;
          clearTimeout(timer);
          timersRef.current.delete(timer);
          opts.rollback(snapshot);
        },
      },
    });
  }, []);
}
