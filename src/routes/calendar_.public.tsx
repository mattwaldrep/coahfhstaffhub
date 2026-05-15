import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { expandEvents, type Occurrence } from "@/lib/calendar-expand";
import { getPublicEvents, type PublicEventRow } from "@/lib/public-calendar.functions";

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

const SUB_CALS = [
  { value: "forest_hills_main", label: "Forest Hills Main", color: "var(--cal-main)" },
  { value: "coah_lm", label: "COAH:LM", color: "var(--cal-lm)" },
  { value: "youth", label: "Youth", color: "var(--cal-youth)" },
  { value: "general", label: "General", color: "var(--cal-general)" },
];

type PubOccurrence = Occurrence<PublicEventRow & {
  // calendar-expand requires these on EventRowLike — already present on PublicEventRow
}>;

function PublicCalendarPage() {
  const [view, setView] = useState<"month" | "week" | "list">("month");
  const [cursor, setCursor] = useState(new Date());
  const [events, setEvents] = useState<PublicEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, boolean>>({
    forest_hills_main: true,
    coah_lm: true,
    youth: true,
    general: true,
  });
  const [selected, setSelected] = useState<PubOccurrence | null>(null);

  const range = useMemo(() => {
    if (view === "week") {
      return {
        start: startOfWeek(cursor, { weekStartsOn: 0 }),
        end: endOfWeek(cursor, { weekStartsOn: 0 }),
      };
    }
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
    getPublicEvents({
      data: {
        rangeStart: range.start.toISOString(),
        rangeEnd: range.end.toISOString(),
      },
    })
      .then((res) => {
        if (!active) return;
        setEvents(res.events);
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

  const occurrences = useMemo(
    () => expandEvents(events, range.start, range.end) as PubOccurrence[],
    [events, range.start.getTime(), range.end.getTime()],
  );

  const visible = occurrences.filter((o) => {
    const cals = [o.sub_calendar, ...(o.other_listings ?? [])];
    return cals.some((c) => filters[c]);
  });

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
              onClick={() =>
                setCursor(view === "week" ? addWeeks(cursor, -1) : addMonths(cursor, -1))
              }
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="font-display text-lg min-w-[10rem] text-center">
              {format(cursor, view === "week" ? "MMM d, yyyy" : "MMMM yyyy")}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                setCursor(view === "week" ? addWeeks(cursor, 1) : addMonths(cursor, 1))
              }
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>
              Today
            </Button>
          </div>

          <div className="flex rounded-full border border-border overflow-hidden">
            {(["month", "week", "list"] as const).map((v) => (
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

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {SUB_CALS.map((s) => (
            <button
              key={s.value}
              onClick={() => setFilters({ ...filters, [s.value]: !filters[s.value] })}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${
                filters[s.value]
                  ? "bg-surface border-border"
                  : "bg-transparent border-border/50 text-muted-foreground"
              }`}
            >
              <span
                className="inline-block w-2 h-2 rounded-full mr-2"
                style={{ background: s.color }}
              />
              {s.label}
            </button>
          ))}
        </div>

        {loadError && (
          <div className="mb-4 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg p-3">
            {loadError}
          </div>
        )}

        {loading && events.length === 0 ? (
          <div className="bg-surface border border-border rounded-2xl p-12 text-sm text-muted-foreground text-center">
            Loading events…
          </div>
        ) : (
          <>
            {view === "month" && (
              <MonthGrid cursor={cursor} occurrences={visible} onPickEvent={setSelected} />
            )}
            {view === "week" && (
              <WeekStrip cursor={cursor} occurrences={visible} onPickEvent={setSelected} />
            )}
            {view === "list" && <ListView occurrences={visible} onPickEvent={setSelected} />}
          </>
        )}
      </main>

      <footer className="max-w-6xl mx-auto px-4 py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} City on a Hill Forest Hills
      </footer>

      <EventDetailsDialog occ={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function EventChip({ occ }: { occ: PubOccurrence }) {
  const cal = SUB_CALS.find((s) => s.value === occ.sub_calendar) ?? SUB_CALS[3];
  return (
    <div
      className="text-[10px] truncate px-1.5 py-0.5 rounded hover:opacity-80"
      style={{
        background: `color-mix(in oklab, ${cal.color} 22%, transparent)`,
        color: `color-mix(in oklab, ${cal.color} 90%, white)`,
      }}
    >
      {!occ.all_day && <>{format(occ.occurrence_date, "h:mm")} </>}
      {occ.title}
    </div>
  );
}

function MonthGrid({
  cursor,
  occurrences,
  onPickEvent,
}: {
  cursor: Date;
  occurrences: PubOccurrence[];
  onPickEvent: (o: PubOccurrence) => void;
}) {
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
  const days: Date[] = [];
  for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) days.push(new Date(d));

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
          const dayEvents = occurrences.filter((o) => isSameDay(o.occurrence_date, day));
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
                {dayEvents.slice(0, 3).map((o, i) => (
                  <button
                    key={`${o.id}-${i}`}
                    onClick={() => onPickEvent(o)}
                    className="w-full text-left"
                  >
                    <EventChip occ={o} />
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

function WeekStrip({
  cursor,
  occurrences,
  onPickEvent,
}: {
  cursor: Date;
  occurrences: PubOccurrence[];
  onPickEvent: (o: PubOccurrence) => void;
}) {
  const start = startOfWeek(cursor, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * 86400000));

  return (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
      {days.map((day) => {
        const dayEvents = occurrences.filter((o) => isSameDay(o.occurrence_date, day));
        return (
          <div
            key={day.toISOString()}
            className="bg-surface border border-border rounded-xl p-3 min-h-[10rem]"
          >
            <div className="mb-2">
              <div className="text-xs text-muted-foreground">{format(day, "EEE")}</div>
              <div className={`text-lg font-display ${isToday(day) ? "text-primary" : ""}`}>
                {format(day, "d")}
              </div>
            </div>
            <div className="space-y-1">
              {dayEvents.map((o, i) => {
                const cal = SUB_CALS.find((s) => s.value === o.sub_calendar) ?? SUB_CALS[3];
                return (
                  <button
                    key={`${o.id}-${i}`}
                    onClick={() => onPickEvent(o)}
                    className="w-full text-left text-xs p-2 rounded-lg hover:opacity-90"
                    style={{
                      background: `color-mix(in oklab, ${cal.color} 18%, transparent)`,
                    }}
                  >
                    <div className="font-medium truncate">{o.title}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {o.all_day ? "All day" : format(o.occurrence_date, "p")}
                    </div>
                  </button>
                );
              })}
              {dayEvents.length === 0 && (
                <div className="text-[11px] text-muted-foreground/60">—</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListView({
  occurrences,
  onPickEvent,
}: {
  occurrences: PubOccurrence[];
  onPickEvent: (o: PubOccurrence) => void;
}) {
  if (occurrences.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-8 text-sm text-muted-foreground text-center">
        No events to show.
      </div>
    );
  }
  return (
    <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
      {occurrences.map((o, i) => {
        const cal = SUB_CALS.find((s) => s.value === o.sub_calendar) ?? SUB_CALS[3];
        return (
          <button
            key={`${o.id}-${i}`}
            onClick={() => onPickEvent(o)}
            className="w-full p-4 flex items-center gap-4 text-left hover:bg-background/40 transition"
          >
            <div className="w-1 self-stretch rounded-full" style={{ background: cal.color }} />
            <div className="flex-1 min-w-0">
              <div className="font-medium flex items-center gap-2 flex-wrap">
                {o.title}
                {o.rrule && <Repeat className="w-3 h-3 text-muted-foreground" />}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {cal.label}
                {o.category && <> · {o.category}</>}
                {o.leader_name && <> · Led by {o.leader_name}</>}
                {o.location && <> · {o.location}</>}
              </div>
            </div>
            <div className="text-sm text-muted-foreground shrink-0 text-right">
              <div>{format(o.occurrence_date, "EEE, MMM d")}</div>
              <div className="text-xs">
                {o.all_day ? "All day" : format(o.occurrence_date, "p")}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function EventDetailsDialog({
  occ,
  onClose,
}: {
  occ: PubOccurrence | null;
  onClose: () => void;
}) {
  const cal = occ ? SUB_CALS.find((s) => s.value === occ.sub_calendar) ?? SUB_CALS[3] : null;
  return (
    <Dialog open={!!occ} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        {occ && cal && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ background: cal.color }}
                />
                {occ.title}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">When</div>
                <div>
                  {format(occ.occurrence_date, "EEEE, MMMM d, yyyy")}
                  {!occ.all_day && <> · {format(occ.occurrence_date, "p")}</>}
                  {occ.all_day && <> · All day</>}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Calendar</div>
                <div>{cal.label}</div>
              </div>
              {occ.category && (
                <div>
                  <div className="text-xs text-muted-foreground">Category</div>
                  <div>{occ.category}</div>
                </div>
              )}
              {occ.leader_name && (
                <div>
                  <div className="text-xs text-muted-foreground">Led by</div>
                  <div>{occ.leader_name}</div>
                </div>
              )}
              {occ.location && (
                <div>
                  <div className="text-xs text-muted-foreground">Location</div>
                  <div>{occ.location}</div>
                </div>
              )}
              {occ.description && (
                <div>
                  <div className="text-xs text-muted-foreground">Details</div>
                  <div className="whitespace-pre-wrap">{occ.description}</div>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
