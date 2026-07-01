import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { updateMinistryPlan } from "@/lib/ministry-plans.functions";
import { toast } from "sonner";

export type SaveState = "idle" | "saving" | "saved" | "error";

export function useAutosave(planId: string, editable: boolean) {
  const update = useServerFn(updateMinistryPlan);
  const [state, setState] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Record<string, any>>({});

  const flush = useCallback(async () => {
    if (!editable) return;
    const patch = pending.current;
    if (!Object.keys(patch).length) return;
    pending.current = {};
    setState("saving");
    try {
      await update({ data: { planId, patch } });
      setState("saved");
      setTimeout(() => setState((s) => (s === "saved" ? "idle" : s)), 1500);
    } catch (e: any) {
      setState("error");
      toast.error(e?.message ?? "Failed to save");
    }
  }, [update, planId, editable]);

  const save = useCallback(
    (patch: Record<string, any>, opts?: { debounce?: number }) => {
      if (!editable) return;
      Object.assign(pending.current, patch);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, opts?.debounce ?? 500);
    },
    [flush, editable],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { save, flush, state };
}
