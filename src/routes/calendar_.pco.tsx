import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { addMonths, startOfMonth, format, isSameDay, parseISO } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bookmark, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, MapPin, RefreshCw, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { getPcoCalendar, type PcoCalendarInstance } from "@/lib/pco-calendar.functions";
import { PcoEventCollaboration } from '@/components/calendar/PcoEventCollaboration';

export const Route = createFileRoute("/calendar_/pco")({
  validateSearch: (search: Record<string, unknown>) => ({
    instance: typeof search.instance === 'string' && /^\d+$/.test(search.instance) ? search.instance : undefined,
    month: typeof search.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(search.month) ? search.month : undefined,
  }),
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
  const routeSearch = Route.useSearch();
  const fetchCal = useServerFn(getPcoCalendar);
  const [anchor, setAnchor] = useState(() => startOfMonth(routeSearch.month ? parseISO(`${routeSearch.month}-01`) : new Date()));
  const prefsKey = user?.id ? `pco-calendar:prefs:${user.id}` : null;
  const loadedPrefs = (() => {
    if (typeof window === "undefined" || !prefsKey) return null;
    try {
      const raw = window.localStorage.getItem(prefsKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();
  const [span, setSpan] = useState<number>(loadedPrefs?.span ?? 1);
  const [search, setSearch] = useState("");
  // Filters are exclusion-based: everything is on by default and clicking a
  // tag or feed hides it. Empty sets mean "show everything".
  const [excludedTags, setExcludedTags] = useState<Set<string>>(new Set(loadedPrefs?.excludedTags ?? []));
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [excludedFeeds, setExcludedFeeds] = useState<Set<string>>(new Set(loadedPrefs?.excludedFeeds ?? []));
  const [feedsExpanded, setFeedsExpanded] = useState(false);
  const [feedTypesOpen, setFeedTypesOpen] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<PcoCalendarInstance | null>(null);
  const [today, setToday] = useState<Date | null>(null);
  const [openedFromLink, setOpenedFromLink] = useState(false);
  useEffect(() => setToday(new Date()), []);

  const rangeEnd = addMonths(anchor, span);
  const feedKey = [...excludedFeeds].sort().join(",");
  const q = useQuery({
    queryKey: ["pco-calendar", anchor.toISOString(), span, feedKey],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: () => fetchCal({ data: { from: anchor.toISOString(), to: rangeEnd.toISOString(), excludeFeedIds: excludedFeeds.size > 0 ? [...excludedFeeds] : undefined } }),
  });

  const tagGroups = q.data?.tagGroups ?? [];
  useEffect(() => {
    if (!routeSearch.instance || openedFromLink || !q.data) return;
    const event = q.data.instances.find(item => item.id === routeSearch.instance);
    if (event) { setOpen(event); setOpenedFromLink(true); }
  }, [routeSearch.instance, openedFromLink, q.data]);
  const tagById = useMemo(() => {
    const m = new Map<string, { name: string; color: string | null; group: string }>();
    for (const g of tagGroups) for (const t of g.tags) m.set(t.id, { name: t.name, color: t.color, group: g.name });
    return m;
  }, [tagGroups]);

  const feeds = q.data?.feeds ?? [];
  const FEED_TYPE_LABELS: Record<string, string> = { calendar: "Calendar", registrations: "Registrations", groups: "Groups", form: "Forms", ical: "iCal Feeds" };
  const feedTypeOrder = ["calendar", "registrations", "groups", "form", "ical"];
  const feedsByType = useMemo(() => {
    const m = new Map<string, typeof feeds>();
    for (const f of feeds) {
      const list = m.get(f.feed_type) ?? [];
      list.push(f);
      m.set(f.feed_type, list);
    }
    return [...m.entries()].sort((a, b) => {
      const ai = feedTypeOrder.indexOf(a[0]);
      const bi = feedTypeOrder.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [feeds]);
  const feedById = useMemo(() => new Map(feeds.map((f) => [f.id, f])), [feeds]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data?.instances ?? []).filter((e) => {
      if (s && !`${e.name} ${e.location ?? ""}`.toLowerCase().includes(s)) return false;
      if (excludedTags.size > 0 && e.tag_ids.some((t) => excludedTags.has(t))) return false;
      return true;
    });
  }, [q.data, search, excludedTags]);

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
    setExcludedTags((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const toggleFeed = (id: string) =>
    setExcludedFeeds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const saveDefaultView = () => {
    if (!prefsKey) { toast.error("Sign in to save preferences"); return; }
    try {
      window.localStorage.setItem(
        prefsKey,
        JSON.stringify({ span, excludedTags: [...excludedTags], excludedFeeds: [...excludedFeeds] }),
      );
      toast.success("Saved as your default view");
    } catch {
      toast.error("Could not save preferences");
    }
  };

  const resetDefaultView = () => {
    if (prefsKey) {
      try { window.localStorage.removeItem(prefsKey); } catch { /* ignore */ }
    }
    setSpan(1);
    setExcludedTags(new Set());
    setExcludedFeeds(new Set());
    toast.success("Back to showing everything");
  };

  const toggleFeedType = (type: string) =>
    setFeedTypesOpen((prev) => {
      const n = new Set(prev);
      n.has(type) ? n.delete(type) : n.add(type);
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
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/calendar" search={{ event: undefined }}>Back to current calendar</Link>
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
        <Button variant="outline" size="sm" onClick={saveDefaultView}>
          <Bookmark className="w-3.5 h-3.5 mr-1" /> Save as default
        </Button>
        <Button variant="ghost" size="sm" onClick={resetDefaultView}>
          <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset
        </Button>
      </div>

      {feeds.length > 0 && (
        <div className="border-y py-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFeedsExpanded((v) => !v)}
              aria-expanded={feedsExpanded}
              className="flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-primary transition-colors"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${feedsExpanded ? "rotate-0" : "-rotate-90"}`} />
              Feeds
              <span className="text-xs text-muted-foreground font-normal">
                {excludedFeeds.size > 0 ? `${excludedFeeds.size} hidden` : "All on"}
              </span>
            </button>
            {!feedsExpanded && excludedFeeds.size > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {Array.from(excludedFeeds).map((id) => {
                  const feed = feedById.get(id);
                  return feed ? <Badge key={id} variant="outline" className="text-[10px] line-through opacity-60">{feed.name}</Badge> : null;
                })}
              </div>
            )}
            {excludedFeeds.size > 0 && (
              <Button size="sm" variant="ghost" className="h-7 ml-auto" onClick={() => setExcludedFeeds(new Set())}>
                <X className="w-3 h-3 mr-1" /> Show all feeds
              </Button>
            )}
          </div>
          {feedsExpanded && (
            <div className="space-y-1.5 mt-3 pt-3 border-t border-border/50">
              {feedsByType.map(([type, typeFeeds]) => {
                const isOpen = feedTypesOpen.has(type);
                const hiddenCount = typeFeeds.filter((f) => excludedFeeds.has(f.id)).length;
                return (
                  <div key={type}>
                    <button
                      type="button"
                      onClick={() => toggleFeedType(type)}
                      aria-expanded={isOpen}
                      className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors py-1"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-0" : "-rotate-90"}`} />
                      {FEED_TYPE_LABELS[type] ?? type}
                      {hiddenCount > 0 && <span className="text-muted-foreground">· {hiddenCount} hidden</span>}
                    </button>
                    {isOpen && (
                      <div className="flex flex-wrap gap-1.5 pl-5 pb-1">
                        {typeFeeds.map((f) => {
                          const off = excludedFeeds.has(f.id);
                          return (
                            <Button key={f.id} size="sm" className={`h-7 ${off ? "opacity-60 line-through" : ""}`} variant={off ? "outline" : "default"} onClick={() => toggleFeed(f.id)}>
                              {f.name}
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tagGroups.some((g) => g.tags.length > 0) && (
        <div className="border-y py-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTagsExpanded((v) => !v)}
              aria-expanded={tagsExpanded}
              className="flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-primary transition-colors"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${tagsExpanded ? "rotate-0" : "-rotate-90"}`} />
              Tags
              <span className="text-xs text-muted-foreground font-normal">
                {excludedTags.size > 0 ? `${excludedTags.size} hidden` : "All on"}
              </span>
            </button>
            {!tagsExpanded && excludedTags.size > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {Array.from(excludedTags).map((id) => {
                  const tag = tagById.get(id);
                  return tag ? <Badge key={id} variant="outline" className="text-[10px] line-through opacity-60">{tag.name}</Badge> : null;
                })}
              </div>
            )}
            {excludedTags.size > 0 && (
              <Button size="sm" variant="ghost" className="h-7 ml-auto" onClick={() => setExcludedTags(new Set())}>
                <X className="w-3 h-3 mr-1" /> Show all tags
              </Button>
            )}
          </div>
          {tagsExpanded && (
            <div className="space-y-2 mt-3 pt-3 border-t border-border/50">
              {tagGroups.filter((g) => g.tags.length > 0).map((g) => (
                <div key={g.id} className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground w-28 shrink-0">{g.name}</span>
                  {g.tags.map((t) => {
                    const off = excludedTags.has(t.id);
                    return (
                      <Button key={t.id} size="sm" className={`h-7 ${off ? "opacity-60 line-through" : ""}`} variant={off ? "outline" : "default"} onClick={() => toggleTag(t.id)}>
                        {t.name}
                      </Button>
                    );
                  })}
                </div>
              ))}
            </div>
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
                <Button variant="outline" key={e.id} onClick={() => setOpen(e)} className="w-full h-auto block whitespace-normal text-left rounded-lg border bg-card p-3 hover:bg-accent transition-colors">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="text-xs text-muted-foreground w-28">
                      {e.all_day ? "All day" : `${format(new Date(e.starts_at), "h:mm a")}${e.ends_at ? ` – ${format(new Date(e.ends_at), "h:mm a")}` : ""}`}
                    </span>
                    <span className="font-medium">{e.name}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5 pl-0 sm:pl-[124px]">
                    {e.location && <span className="text-xs text-muted-foreground truncate max-w-xs">{e.location}</span>}
                    {e.tag_ids.map((id) => {
                      const tag = tagById.get(id);
                      return tag ? <Badge key={id} variant="outline" className="text-[10px]">{tag.name}</Badge> : null;
                    })}
                  </div>
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-2xl max-h-[85dvh] overflow-y-auto">
          {open && (
            <>
              <DialogHeader><DialogTitle>{open.name}</DialogTitle></DialogHeader>
              <div className="space-y-3 text-sm">
                <div>
                  {format(new Date(open.starts_at), "EEEE, MMMM d, yyyy")}
                  {!open.all_day && ` · ${format(new Date(open.starts_at), "h:mm a")}${open.ends_at ? ` – ${format(new Date(open.ends_at), "h:mm a")}` : ""}`}
                </div>
                {open.recurrence && <div className="text-muted-foreground">{open.recurrence}</div>}
                
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
              <PcoEventCollaboration key={open.id} instanceId={open.id} pcoLocation={open.location} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
