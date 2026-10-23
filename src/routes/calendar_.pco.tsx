import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { addMonths, startOfMonth, format, isSameDay } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, ExternalLink, MapPin, RefreshCw, X } from "lucide-react";
import { getPcoCalendar, type PcoCalendarInstance } from "@/lib/pco-calendar.functions";

export const Route = createFileRoute("/calendar_/pco")({
  head: () => ({
    meta: [
      { title: "Planning Center Calendar (Beta) — Staff Hub" },
      { name: "description", content: "Live view of the church calendar pulled from Planning Center." },
      { property: "og:title", content: "Planning Center Calendar (Beta) — Staff Hub" },
      { property: "og:description", content: "Live view of the church calendar pulled from Planning Center." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <PcoCalendarPage />
    </AppShell>
  ),
});

function PcoCalendarPage() {
  const { user } = useAuth();
  const fetchCal = useServerFn(getPcoCalendar);
  const [anchor, setAnchor] = useState(() => startOfMonth(new Date()));
  const [span, setSpan] = useState(1);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<PcoCalendarInstance | null>(null);
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => setToday(new Date()), []);

  const rangeEnd = addMonths(anchor, span);
  const q = useQuery({
    queryKey: ["pco-calendar", anchor.toISOString(), span],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: () => fetchCal({ data: { from: anchor.toISOString(), to: rangeEnd.toISOString() } }),
  });

  const tagGroups = q.data?.tagGroups ?? [];
  const tagById = useMemo(() => {
    const m = new Map<string, { name: string; color: string | null; group: string }>();
    for (const g of tagGroups) for (const t of g.tags) m.set(t.id, { name: t.name, color: t.color, group: g.name });
    return m;
  }, [tagGroups]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data?.instances ?? []).filter((e) => {
      if (s && !`${e.name} ${e.location ?? ""}`.toLowerCase().includes(s)) return false;
      if (tagFilter.size > 0 && !e.tag_ids.some((t) => tagFilter.has(t))) return false;
      return true;
    });
  }, [q.data, search, tagFilter]);

  const byDay = useMemo(() => {
    const groups: { day: Date; items: PcoCalendarInstance[] }[] = [];
    for (const e of filtered) {
      const d = new Date(e.starts_at);
      const last = groups[groups.length - 1];
      if (last && isSameDay(last.day, d)) last.items.push(e);
      else groups.push({ day: d, items: [e] });
    }
    return groups;
  }, [filtered]);

  const toggleTag = (id: string) =>
    setTagFilter((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const label =
    span === 1 ? format(anchor, "MMMM yyyy") : `${format(anchor, "MMM yyyy")} – ${format(addMonths(anchor, span - 1), "MMM yyyy")}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Planning Center Calendar</h1>
            <Badge variant="secondary">Beta</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Read-only, pulled live from Planning Center. Add or change events in Planning Center.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/calendar">Back to current calendar</Link>
        </Button>
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
        <Input className="w-56" placeholder="Search events or places" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button variant="ghost" size="icon" aria-label="Refresh" onClick={() => q.refetch()}>
          <RefreshCw className={`w-4 h-4 ${q.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {tagGroups.some((g) => g.tags.length > 0) && (
        <div className="space-y-2 rounded-lg border bg-card p-3">
          {tagGroups.filter((g) => g.tags.length > 0).map((g) => (
            <div key={g.id} className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground w-28 shrink-0">{g.name}</span>
              {g.tags.map((t) => (
                <Button key={t.id} size="sm" className="h-7" variant={tagFilter.has(t.id) ? "default" : "outline"} onClick={() => toggleTag(t.id)}>
                  {t.name}
                </Button>
              ))}
            </div>
          ))}
          {tagFilter.size > 0 && (
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setTagFilter(new Set())}>
              <X className="w-3 h-3 mr-1" /> Clear tags
            </Button>
          )}
        </div>
      )}

      {q.isLoading && <p className="text-sm text-muted-foreground">Loading from Planning Center…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {q.data?.error && <p className="text-sm text-destructive">{q.data.error}</p>}
      {q.data && !q.data.error && byDay.length === 0 && (
        <p className="text-sm text-muted-foreground">No events in this range.</p>
      )}

      <div className="space-y-4">
        {byDay.map(({ day, items }) => (
          <div key={day.toISOString()} className="grid grid-cols-[88px_1fr] gap-3">
            <div className={`text-sm ${today && isSameDay(day, today) ? "text-primary font-semibold" : "text-muted-foreground"}`}>
              <div className="font-medium">{format(day, "EEE")}</div>
              <div>{format(day, "MMM d")}</div>
            </div>
            <div className="space-y-2">
              {items.map((e) => (
                <button key={e.id} onClick={() => setOpen(e)} className="w-full text-left rounded-lg border bg-card p-3 hover:bg-accent transition-colors">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="text-xs text-muted-foreground w-28">
                      {e.all_day ? "All day" : `${format(new Date(e.starts_at), "h:mm a")}${e.ends_at ? ` – ${format(new Date(e.ends_at), "h:mm a")}` : ""}`}
                    </span>
                    <span className="font-medium">{e.name}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5 pl-0 sm:pl-[124px]">
                    {e.location && <span className="text-xs text-muted-foreground truncate max-w-xs">{e.location}</span>}
                    {e.tag_ids.map((t) => tagById.get(t)).filter(Boolean).map((t) => (
                      <Badge key={t!.name} variant="outline" className="text-[10px]">{t!.name}</Badge>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-lg">
          {open && (
            <>
              <DialogHeader><DialogTitle>{open.name}</DialogTitle></DialogHeader>
              <div className="space-y-3 text-sm">
                <div>
                  {format(new Date(open.starts_at), "EEEE, MMMM d, yyyy")}
                  {!open.all_day && ` · ${format(new Date(open.starts_at), "h:mm a")}${open.ends_at ? ` – ${format(new Date(open.ends_at), "h:mm a")}` : ""}`}
                </div>
                {open.recurrence && <div className="text-muted-foreground">{open.recurrence}</div>}
                {open.location && <div className="flex gap-1.5"><MapPin className="w-4 h-4 shrink-0 mt-0.5" />{open.location}</div>}
                {open.summary && <p>{open.summary}</p>}
                {open.description && (
                  <div className="text-muted-foreground whitespace-pre-line">{open.description.replace(/<[^>]+>/g, "")}</div>
                )}
                <div className="flex flex-wrap gap-2 pt-2">
                  {open.registration_url && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={open.registration_url} target="_blank" rel="noreferrer">Registration <ExternalLink className="w-3 h-3 ml-1" /></a>
                    </Button>
                  )}
                  {open.church_center_url && open.visible_in_church_center && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={open.church_center_url} target="_blank" rel="noreferrer">Church Center <ExternalLink className="w-3 h-3 ml-1" /></a>
                    </Button>
                  )}
                  <Button size="sm" variant="outline" asChild>
                    <a href={`https://calendar.planningcenteronline.com/events/${open.event_id}`} target="_blank" rel="noreferrer">Open in Planning Center <ExternalLink className="w-3 h-3 ml-1" /></a>
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
