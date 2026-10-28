import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { addMonths, startOfMonth, format, isSameDay, parseISO } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Repeat } from "lucide-react";
import { expandEvents, type EventRowLike, type Occurrence } from "@/lib/calendar-expand";
import { useSubCals } from "@/lib/use-sub-cals";

type ArchiveEvent = EventRowLike & {
  description: string | null;
  location: string | null;
  room_needed: string | null;
  leader_name: string | null;
  category: string | null;
};

export const Route = createFileRoute("/calendar_/archive")({
  validateSearch: (search: Record<string, unknown>) => ({
    event: typeof search.event === "string" ? search.event : undefined,
    month: typeof search.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(search.month) ? search.month : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Calendar Archive — Staff Hub" },
      { name: "description", content: "Read-only archive of events from the former Hub calendar." },
      { property: "og:title", content: "Calendar Archive — Staff Hub" },
      { property: "og:description", content: "Read-only archive of events from the former Hub calendar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <ArchivePage />
    </AppShell>
  ),
});

function ArchivePage() {
  const { user } = useAuth();
  const routeSearch = Route.useSearch();
  const { labelFor, colorFor } = useSubCals();
  const [anchor, setAnchor] = useState(() => startOfMonth(routeSearch.month ? parseISO(`${routeSearch.month}-01`) : new Date()));
  const [span, setSpan] = useState(1);
  const [search, setSearch] = useState("");
  const [events, setEvents] = useState<ArchiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Occurrence<ArchiveEvent> | null>(null);
  const [openedFromLink, setOpenedFromLink] = useState(false);

  const rangeStart = anchor;
  const rangeEnd = addMonths(anchor, span);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    supabase
      .from("calendar_events")
      .select("id,title,description,start_at,end_at,sub_calendar,leader_name,location,room_needed,all_day,category,rrule,excluded_dates")
      .or(`and(start_at.gte.${rangeStart.toISOString()},start_at.lte.${rangeEnd.toISOString()}),rrule.not.is.null`)
      .order("start_at", { ascending: true })
      .then(({ data }) => {
        if (!active) return;
        setEvents((data ?? []) as ArchiveEvent[]);
        setLoading(false);
      });
    return () => { active = false; };
  }, [user, rangeStart.getTime(), rangeEnd.getTime()]);

  const occurrences = useMemo(
    () => expandEvents(events, rangeStart, rangeEnd),
    [events, rangeStart.getTime(), rangeEnd.getTime()],
  );

  useEffect(() => {
    if (!routeSearch.event || openedFromLink || loading) return;
    const match = occurrences.find((o) => o.id === routeSearch.event) ?? null;
    if (match) { setOpen(match); setOpenedFromLink(true); }
  }, [routeSearch.event, openedFromLink, loading, occurrences]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return occurrences;
    return occurrences.filter((o) =>
      `${o.title} ${o.location ?? ""} ${o.leader_name ?? ""}`.toLowerCase().includes(s),
    );
  }, [occurrences, search]);

  const byDay = useMemo(() => {
    const groups: { day: Date; items: Occurrence<ArchiveEvent>[] }[] = [];
    for (const o of filtered) {
      const last = groups[groups.length - 1];
      if (last && isSameDay(last.day, o.occurrence_date)) last.items.push(o);
      else groups.push({ day: o.occurrence_date, items: [o] });
    }
    return groups;
  }, [filtered]);

  const label =
    span === 1 ? format(anchor, "MMMM yyyy") : `${format(anchor, "MMM yyyy")} – ${format(addMonths(anchor, span - 1), "MMM yyyy")}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Calendar Archive</h1>
            <Badge variant="secondary">Read-only</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Events from the former Hub calendar, kept for reference. The live calendar now comes from Planning Center.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Previous" onClick={() => setAnchor(addMonths(anchor, -span))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setAnchor(startOfMonth(new Date()))}>Today</Button>
        <Button variant="outline" size="icon" aria-label="Next" onClick={() => setAnchor(addMonths(anchor, span))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        <div className="font-medium px-2">{label}</div>
        <Select value={String(span)} onValueChange={(v) => setSpan(Number(v))}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[1, 3, 6, 12].map((n) => (
              <SelectItem key={n} value={String(n)}>{n} month{n > 1 ? "s" : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input className="w-56" placeholder="Search archived events" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading archived events…</p>}
      {!loading && byDay.length === 0 && (
        <p className="text-sm text-muted-foreground">No archived events in this range.</p>
      )}

      <div className="space-y-4">
        {byDay.map(({ day, items }) => (
          <div key={day.toISOString()} className="grid grid-cols-[88px_1fr] gap-3">
            <div className="text-sm text-muted-foreground">
              <div className="font-medium">{format(day, "EEE")}</div>
              <div>{format(day, "MMM d")}</div>
            </div>
            <div className="space-y-2">
              {items.map((o, i) => (
                <Button variant="outline" key={`${o.id}-${i}`} onClick={() => setOpen(o)} className="w-full h-auto block whitespace-normal text-left rounded-lg border bg-card p-3 hover:bg-accent transition-colors">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="text-xs text-muted-foreground w-28">
                      {o.all_day ? "All day" : format(o.occurrence_date, "h:mm a")}
                    </span>
                    <span className="font-medium inline-flex items-center gap-1.5">
                      {o.title}
                      {o.rrule && <Repeat className="w-3 h-3 text-muted-foreground" />}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-0 sm:pl-[124px]">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ background: colorFor(o.sub_calendar) }}
                    />
                    <span className="text-xs text-muted-foreground">{labelFor(o.sub_calendar)}</span>
                    {o.location && <span className="text-xs text-muted-foreground truncate max-w-xs">· {o.location}</span>}
                  </div>
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto">
          {open && (
            <>
              <DialogHeader><DialogTitle>{open.title}</DialogTitle></DialogHeader>
              <div className="space-y-3 text-sm">
                <div>
                  {format(open.occurrence_date, "EEEE, MMMM d, yyyy")}
                  {!open.all_day && ` · ${format(open.occurrence_date, "h:mm a")}`}
                  {open.all_day && " · All day"}
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: colorFor(open.sub_calendar) }} />
                  {labelFor(open.sub_calendar)}
                  {open.category && <> · {open.category}</>}
                </div>
                {open.leader_name && <div>Led by {open.leader_name}</div>}
                {open.location && <div className="text-muted-foreground">{open.location}</div>}
                {open.room_needed && <div className="text-muted-foreground">Room: {open.room_needed}</div>}
                {open.description && (
                  <div className="text-muted-foreground whitespace-pre-line">{open.description.replace(/<[^>]+>/g, "")}</div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
