import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getPublicPcoCalendar, type PublicPcoEvent, type PublicPcoTag } from "@/lib/public-calendar.functions";

export const Route = createFileRoute("/calendar_/public")({
  head: () => ({
    meta: [
      { title: "Calendar — City on a Hill Forest Hills" },
      {
        name: "description",
        content:
          "Upcoming events at City on a Hill Forest Hills — services, classes, youth, and community gatherings.",
      },
      { property: "og:title", content: "Calendar — City on a Hill Forest Hills" },
      {
        property: "og:description",
        content:
          "Upcoming events at City on a Hill Forest Hills — services, classes, youth, and community gatherings.",
      },
    ],
  }),
  component: PublicCalendarPage,
});

function PublicCalendarPage() {
  const [view, setView] = useState<"month" | "list">("month");
  const [cursor, setCursor] = useState(new Date());
  const [events, setEvents] = useState<PublicPcoEvent[]>([]);
  const [tags, setTags] = useState<PublicPcoTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [excludedTags, setExcludedTags] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<PublicPcoEvent | null>(null);

  const range = useMemo(() => {
    if (view === "month") {
      return {
        start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 }),
        end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 }),
      };
    }
    return {
      start: new Date(cursor.getFullYear(), cursor.getMonth(), 1),
      end: addMonths(cursor, 2),
    };
  }, [cursor, view]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getPublicPcoCalendar({
      data: {
        rangeStart: range.start.toISOString(),
        rangeEnd: range.end.toISOString(),
      },
    })
      .then((res) => {
        if (!active) return;
        setEvents(res.events);
        setTags(res.tags);
        setLoadError(res.error);
      })
      .catch(() => {
        if (!active) return;
        setLoadError("Failed to load events");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [range.start.getTime(), range.end.getTime()]);

  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  // Only offer filters for tags actually present on visible events.
  const activeTags = useMemo(() => {
    const ids = new Set(events.flatMap((e) => e.tag_ids));
    return tags.filter((t) => ids.has(t.id));
  }, [events, tags]);

  const visible = events.filter(
    (e) => !(excludedTags.size > 0 && e.tag_ids.some((t) => excludedTags.has(t))),
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-display font-bold">
              City on a Hill Forest Hills
            </h1>
            <p className="text-xs text-muted-foreground">Public calendar</p>
          </div>
          <Link
            to="/login"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Staff sign in
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCursor(addMonths(cursor, -1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="font-display text-lg min-w-[10rem] text-center">
              {format(cursor, "MMMM yyyy")}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCursor(addMonths(cursor, 1))}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>
              Today
            </Button>
          </div>

          <div className="flex rounded-full border border-border overflow-hidden">
            {(["month", "list"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs capitalize transition ${
                  view === v ? "bg-surface" : "bg-transparent text-muted-foreground"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {activeTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {activeTags.map((t) => {
              const off = excludedTags.has(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() =>
                    setExcludedTags((prev) => {
                      const n = new Set(prev);
                      n.has(t.id) ? n.delete(t.id) : n.add(t.id);
                      return n;
                    })
                  }
                  className={`text-xs px-3 py-1.5 rounded-full border transition ${
                    off
                      ? "bg-transparent border-border/50 text-muted-foreground line-through"
                      : "bg-surface border-border"
                  }`}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        )}

        {loadError && (
          <div className="mb-4 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg p-3">
            {loadError}
          </div>
        )}

        {loading && events.length === 0 ? (
          <div className="bg-surface border border-border rounded-2xl p-12 text-sm text-muted-foreground text-center">
            Loading events…
          </div>
        ) : view === "month" ? (
          <MonthGrid cursor={cursor} events={visible} onPickEvent={setSelected} />
        ) : (
          <ListView events={visible} tagById={tagById} onPickEvent={setSelected} />
        )}
      </main>

      <footer className="max-w-6xl mx-auto px-4 py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} City on a Hill Forest Hills
      </footer>

      <EventDetailsDialog event={selected} tagById={tagById} onClose={() => setSelected(null)} />
    </div>
  );
}

function timeLabel(e: PublicPcoEvent) {
  if (e.all_day) return "All day";
  const start = format(new Date(e.starts_at), "h:mm a");
  return e.ends_at ? `${start} – ${format(new Date(e.ends_at), "h:mm a")}` : start;
}

function MonthGrid({
  cursor,
  events,
  onPickEvent,
}: {
  cursor: Date;
  events: PublicPcoEvent[];
  onPickEvent: (e: PublicPcoEvent) => void;
}) {
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(new Date(d));

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border text-xs text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-2 py-2 text-center font-medium">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 auto-rows-[minmax(6rem,1fr)]">
        {days.map((day) => {
          const dayEvents = events.filter((e) => isSameDay(new Date(e.starts_at), day));
          const dim = !isSameMonth(day, cursor);
          return (
            <div
              key={day.toISOString()}
              className={`text-left p-1.5 border-r border-b border-border/60 last:border-r-0 flex flex-col gap-1 ${
                dim ? "bg-background/30" : ""
              }`}
            >
              <div
                className={`text-xs font-medium ${
                  isToday(day)
                    ? "text-primary"
                    : dim
                      ? "text-muted-foreground/50"
                      : "text-foreground"
                }`}
              >
                {format(day, "d")}
              </div>
              <div className="space-y-0.5 overflow-hidden">
                {dayEvents.slice(0, 3).map((e) => (
                  <button
                    key={e.id}
                    onClick={() => onPickEvent(e)}
                    className="w-full text-left"
                  >
                    <div className="text-[10px] truncate px-1.5 py-0.5 rounded bg-primary/10 hover:bg-primary/20">
                      {!e.all_day && <>{format(new Date(e.starts_at), "h:mm")} </>}
                      {e.name}
                    </div>
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-muted-foreground px-1.5">
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListView({
  events,
  tagById,
  onPickEvent,
}: {
  events: PublicPcoEvent[];
  tagById: Map<string, PublicPcoTag>;
  onPickEvent: (e: PublicPcoEvent) => void;
}) {
  if (events.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-8 text-sm text-muted-foreground text-center">
        No events to show.
      </div>
    );
  }
  return (
    <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
      {events.map((e) => (
        <button
          key={e.id}
          onClick={() => onPickEvent(e)}
          className="w-full p-4 flex items-center gap-4 text-left hover:bg-background/40 transition"
        >
          <div className="flex-1 min-w-0">
            <div className="font-medium">{e.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {e.tag_ids.map((id) => tagById.get(id)?.name).filter(Boolean).join(" · ")}
              {e.location && <>{e.tag_ids.length > 0 ? " · " : ""}{e.location}</>}
            </div>
          </div>
          <div className="text-sm text-muted-foreground shrink-0 text-right">
            <div>{format(new Date(e.starts_at), "EEE, MMM d")}</div>
            <div className="text-xs">{timeLabel(e)}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

function EventDetailsDialog({
  event,
  tagById,
  onClose,
}: {
  event: PublicPcoEvent | null;
  tagById: Map<string, PublicPcoTag>;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!event} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        {event && (
          <>
            <DialogHeader>
              <DialogTitle>{event.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">When</div>
                <div>
                  {format(new Date(event.starts_at), "EEEE, MMMM d, yyyy")} · {timeLabel(event)}
                </div>
              </div>
              {event.tag_ids.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground">Tags</div>
                  <div>{event.tag_ids.map((id) => tagById.get(id)?.name).filter(Boolean).join(", ")}</div>
                </div>
              )}
              {event.location && (
                <div>
                  <div className="text-xs text-muted-foreground">Location</div>
                  <div>{event.location}</div>
                </div>
              )}
              {event.summary && <p>{event.summary}</p>}
              {event.description && (
                <div>
                  <div className="text-xs text-muted-foreground">Details</div>
                  <div className="whitespace-pre-wrap">{event.description}</div>
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {event.registration_url && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={event.registration_url} target="_blank" rel="noreferrer">
                      Register <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  </Button>
                )}
                {event.church_center_url && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={event.church_center_url} target="_blank" rel="noreferrer">
                      Church Center <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
