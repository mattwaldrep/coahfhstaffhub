import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, RefreshCw, ExternalLink, MapPin, EyeOff, Undo2 } from "lucide-react";
import {
  listPcoSignupQueue,
  importPcoSignups,
  dismissPcoSignups,
  type PcoSignupQueueItem,
} from "@/lib/pco-registrations.functions";

type SubCalOption = { value: string; label: string; color: string };

export function PcoSignupsDialog({
  open,
  onOpenChange,
  subCals,
  categories,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subCals: SubCalOption[];
  categories: { id: string; name: string }[];
  onImported: () => void;
}) {
  const fetchQueue = useServerFn(listPcoSignupQueue);
  const importFn = useServerFn(importPcoSignups);
  const dismissFn = useServerFn(dismissPcoSignups);

  const [items, setItems] = useState<PcoSignupQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDismissed, setShowDismissed] = useState(false);
  const [subCal, setSubCal] = useState<string>(subCals[0]?.value ?? "general");
  const [category, setCategory] = useState<string>("none");

  const load = async (refresh = false) => {
    setLoading(true);
    try {
      const rows = await fetchQueue({ data: { refresh } });
      setItems(rows ?? []);
      setSelected(new Set());
    } catch (e: any) {
      console.error("listPcoSignupQueue", e);
      toast.error(e?.message?.includes("not configured")
        ? "Planning Center isn't configured yet."
        : "Couldn't load Planning Center sign-ups.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (subCals.length && !subCals.some((s) => s.value === subCal)) {
      setSubCal(subCals[0]!.value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subCals]);

  const visible = useMemo(
    () => items.filter((i) => (showDismissed ? i.status === "dismissed" : i.status !== "dismissed")),
    [items, showDismissed],
  );
  const newCount = items.filter((i) => i.status === "new").length;
  const selectableIds = visible.filter((i) => i.status === "new").map((i) => i.signup_time_id);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const doImport = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const res: any = await importFn({
        data: {
          signup_time_ids: [...selected],
          sub_calendar: subCal,
          ...(category !== "none" ? { category } : {}),
        },
      });
      toast.success(`Imported ${res?.imported ?? 0} event${res?.imported === 1 ? "" : "s"} to the calendar`);
      onImported();
      await load(false);
    } catch (e: any) {
      console.error("importPcoSignups", e);
      toast.error("Import failed.");
    } finally {
      setBusy(false);
    }
  };

  const doDismiss = async (ids: string[], dismissed: boolean) => {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      await dismissFn({ data: { signup_time_ids: ids, dismissed } });
      await load(false);
    } catch (e: any) {
      console.error("dismissPcoSignups", e);
      toast.error("Couldn't update that sign-up.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Planning Center sign-ups</DialogTitle>
          <DialogDescription>
            Upcoming sign-up sessions pulled from Planning Center. Pick the ones that belong on the
            church calendar — imported events stay in sync with Planning Center.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={loading || busy}>
            {loading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
            Refresh
          </Button>
          <Button
            variant={showDismissed ? "secondary" : "ghost"}
            size="sm"
            onClick={() => { setShowDismissed((v) => !v); setSelected(new Set()); }}
          >
            {showDismissed ? "Back to queue" : "Skipped"}
          </Button>
          {!showDismissed && selectableIds.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setSelected((prev) =>
                  prev.size === selectableIds.length ? new Set() : new Set(selectableIds),
                )
              }
            >
              {selected.size === selectableIds.length ? "Clear all" : "Select all new"}
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {newCount} new session{newCount === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1 py-2 space-y-2">
          {loading && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading sign-ups…
            </div>
          )}
          {!loading && visible.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {showDismissed ? "Nothing skipped." : "No upcoming sign-ups to import."}
            </div>
          )}
          {!loading &&
            visible.map((i) => {
              const start = parseISO(i.starts_at);
              const isNew = i.status === "new";
              return (
                <div
                  key={i.signup_time_id}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
                >
                  {isNew ? (
                    <Checkbox
                      className="mt-1"
                      checked={selected.has(i.signup_time_id)}
                      onCheckedChange={() => toggle(i.signup_time_id)}
                    />
                  ) : (
                    <div className="w-4 mt-1" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate">{i.name}</span>
                      {i.session_count > 1 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                          Session {i.session_index} of {i.session_count}
                        </span>
                      )}
                      {i.status === "imported" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
                          On calendar
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {format(start, "EEE, MMM d · h:mm a")}
                      {i.ends_at ? ` – ${format(parseISO(i.ends_at), "h:mm a")}` : ""}
                    </div>
                    {i.location && (
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <MapPin className="w-3 h-3 shrink-0" /> <span className="truncate">{i.location}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {i.registration_url && (
                      <a
                        href={i.registration_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground"
                        title="Open in Church Center"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    {i.status === "new" && (
                      <button
                        type="button"
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground"
                        title="Skip this sign-up"
                        disabled={busy}
                        onClick={() => doDismiss([i.signup_time_id], true)}
                      >
                        <EyeOff className="w-4 h-4" />
                      </button>
                    )}
                    {i.status === "dismissed" && (
                      <button
                        type="button"
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground"
                        title="Move back to the queue"
                        disabled={busy}
                        onClick={() => doDismiss([i.signup_time_id], false)}
                      >
                        <Undo2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        <DialogFooter className="border-t border-border pt-3 gap-2 sm:justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={subCal} onValueChange={setSubCal}>
              <SelectTrigger className="w-[170px] h-9">
                <SelectValue placeholder="Sub-calendar" />
              </SelectTrigger>
              <SelectContent>
                {subCals.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={doImport} disabled={busy || selected.size === 0}>
            {busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            Import {selected.size > 0 ? `${selected.size} ` : ""}to calendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
