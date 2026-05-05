import { createFileRoute } from "@tanstack/react-router";
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
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/calendar")({
  component: CalendarPage,
});

const SUB_CALS = [
  { value: "forest_hills_main", label: "Forest Hills Main", color: "var(--cal-main)" },
  { value: "coah_lm", label: "COAH:LM", color: "var(--cal-lm)" },
  { value: "youth", label: "Youth", color: "var(--cal-youth)" },
  { value: "general", label: "General", color: "var(--cal-general)" },
];

const READINESS = [
  { value: "green", label: "Green", color: "oklch(0.7 0.18 145)" },
  { value: "yellow", label: "Yellow", color: "oklch(0.82 0.16 90)" },
  { value: "red", label: "Red", color: "oklch(0.65 0.22 25)" },
];

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  sub_calendar: string;
  leader_name: string | null;
  readiness: string | null;
  location: string | null;
};

type FormState = {
  id?: string;
  title: string;
  sub_calendar: string;
  start_at: string;
  end_at: string;
  leader_name: string;
  location: string;
  readiness: string;
  description: string;
};

const emptyForm = (start = ""): FormState => ({
  title: "",
  sub_calendar: "general",
  start_at: start,
  end_at: "",
  leader_name: "",
  location: "",
  readiness: "green",
  description: "",
});

function CalendarPage() {
  return (
    <AppShell>
      <CalendarBody />
    </AppShell>
  );
}

function CalendarBody() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("core");
  const [view, setView] = useState<"month" | "week" | "list">("month");
  const [cursor, setCursor] = useState(new Date());
  const [events, setEvents] = useState<EventRow[]>([]);
  const [filters, setFilters] = useState<Record<string, boolean>>({
    forest_hills_main: true,
    coah_lm: true,
    youth: true,
    general: true,
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  const range = useMemo(() => {
    if (view === "week") {
      const s = startOfWeek(cursor, { weekStartsOn: 0 });
      return { start: s, end: endOfWeek(cursor, { weekStartsOn: 0 }) };
    }
    if (view === "month") {
      const s = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
      return { start: s, end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 }) };
    }
    return {
      start: new Date(cursor.getFullYear(), cursor.getMonth(), 1),
      end: addMonths(cursor, 2),
    };
  }, [cursor, view]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("calendar_events")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calendar_events" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [range.start.getTime(), range.end.getTime()]);

  async function load() {
    const { data } = await supabase
      .from("calendar_events")
      .select("*")
      .gte("start_at", range.start.toISOString())
      .lte("start_at", range.end.toISOString())
      .order("start_at", { ascending: true });
    setEvents(data ?? []);
  }

  function openNew(date?: Date) {
    if (!canEdit) return;
    const base = date ?? new Date();
    base.setHours(9, 0, 0, 0);
    setForm(emptyForm(format(base, "yyyy-MM-dd'T'HH:mm")));
    setOpen(true);
  }

  function openEdit(ev: EventRow) {
    if (!canEdit) return;
    setForm({
      id: ev.id,
      title: ev.title,
      sub_calendar: ev.sub_calendar,
      start_at: format(new Date(ev.start_at), "yyyy-MM-dd'T'HH:mm"),
      end_at: ev.end_at ? format(new Date(ev.end_at), "yyyy-MM-dd'T'HH:mm") : "",
      leader_name: ev.leader_name ?? "",
      location: ev.location ?? "",
      readiness: ev.readiness ?? "green",
      description: ev.description ?? "",
    });
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      title: form.title,
      sub_calendar: form.sub_calendar as "general",
      start_at: new Date(form.start_at).toISOString(),
      end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
      leader_name: form.leader_name || null,
      location: form.location || null,
      readiness: form.readiness as EventRow["readiness"],
      description: form.description || null,
    };
    const { error } = form.id
      ? await supabase.from("calendar_events").update(payload).eq("id", form.id)
      : await supabase.from("calendar_events").insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(form.id ? "Event updated" : "Event added");
    setOpen(false);
    load();
  }

  async function remove() {
    if (!form.id) return;
    const { error } = await supabase.from("calendar_events").delete().eq("id", form.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Event deleted");
    setOpen(false);
    load();
  }

  const visible = events.filter((e) => filters[e.sub_calendar]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Calendar</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Layered church calendar across all sub-calendars.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          {canEdit && (
            <Button onClick={() => openNew()} size="sm">
              <Plus className="w-4 h-4 mr-1.5" /> New
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
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

        <div className="flex flex-wrap gap-2">
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
      </div>

      {view === "month" && (
        <MonthGrid
          cursor={cursor}
          events={visible}
          onPickDay={openNew}
          onPickEvent={openEdit}
          canEdit={canEdit}
        />
      )}
      {view === "week" && (
        <WeekStrip
          cursor={cursor}
          events={visible}
          onPickDay={openNew}
          onPickEvent={openEdit}
          canEdit={canEdit}
        />
      )}
      {view === "list" && <ListView events={visible} onPickEvent={openEdit} />}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit event" : "Add event"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Sub-calendar</Label>
                <Select
                  value={form.sub_calendar}
                  onValueChange={(v) => setForm({ ...form, sub_calendar: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUB_CALS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Readiness</Label>
                <Select
                  value={form.readiness}
                  onValueChange={(v) => setForm({ ...form, readiness: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {READINESS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Starts</Label>
                <Input
                  type="datetime-local"
                  value={form.start_at}
                  onChange={(e) => setForm({ ...form, start_at: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Ends</Label>
                <Input
                  type="datetime-local"
                  value={form.end_at}
                  onChange={(e) => setForm({ ...form, end_at: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Leader</Label>
                <Input
                  value={form.leader_name}
                  onChange={(e) => setForm({ ...form, leader_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <DialogFooter className="flex sm:justify-between gap-2">
              {form.id ? (
                <Button type="button" variant="ghost" onClick={remove}>
                  <Trash2 className="w-4 h-4 mr-1.5" /> Delete
                </Button>
              ) : <span />}
              <Button type="submit">{form.id ? "Save changes" : "Add event"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MonthGrid({
  cursor,
  events,
  onPickDay,
  onPickEvent,
  canEdit,
}: {
  cursor: Date;
  events: EventRow[];
  onPickDay: (d: Date) => void;
  onPickEvent: (e: EventRow) => void;
  canEdit: boolean;
}) {
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
  const days: Date[] = [];
  for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) days.push(new Date(d));

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border text-xs text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-2 py-2 text-center font-medium">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 auto-rows-[minmax(6rem,1fr)]">
        {days.map((day) => {
          const dayEvents = events.filter((e) => isSameDay(new Date(e.start_at), day));
          const dim = !isSameMonth(day, cursor);
          return (
            <button
              key={day.toISOString()}
              onClick={() => canEdit && onPickDay(day)}
              className={`text-left p-1.5 border-r border-b border-border/60 last:border-r-0 hover:bg-background/50 transition flex flex-col gap-1 ${
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
                {dayEvents.slice(0, 3).map((e) => {
                  const cal = SUB_CALS.find((s) => s.value === e.sub_calendar)!;
                  return (
                    <div
                      key={e.id}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onPickEvent(e);
                      }}
                      className="text-[10px] truncate px-1.5 py-0.5 rounded hover:opacity-80"
                      style={{
                        background: `color-mix(in oklab, ${cal.color} 22%, transparent)`,
                        color: `color-mix(in oklab, ${cal.color} 90%, white)`,
                      }}
                    >
                      {format(new Date(e.start_at), "h:mm")} {e.title}
                    </div>
                  );
                })}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-muted-foreground px-1.5">
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekStrip({
  cursor,
  events,
  onPickDay,
  onPickEvent,
  canEdit,
}: {
  cursor: Date;
  events: EventRow[];
  onPickDay: (d: Date) => void;
  onPickEvent: (e: EventRow) => void;
  canEdit: boolean;
}) {
  const start = startOfWeek(cursor, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * 86400000));

  return (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
      {days.map((day) => {
        const dayEvents = events.filter((e) => isSameDay(new Date(e.start_at), day));
        return (
          <div
            key={day.toISOString()}
            className="bg-surface border border-border rounded-xl p-3 min-h-[10rem]"
          >
            <button
              onClick={() => canEdit && onPickDay(day)}
              className="w-full text-left mb-2"
            >
              <div className="text-xs text-muted-foreground">{format(day, "EEE")}</div>
              <div
                className={`text-lg font-display ${
                  isToday(day) ? "text-primary" : ""
                }`}
              >
                {format(day, "d")}
              </div>
            </button>
            <div className="space-y-1">
              {dayEvents.map((e) => {
                const cal = SUB_CALS.find((s) => s.value === e.sub_calendar)!;
                return (
                  <button
                    key={e.id}
                    onClick={() => onPickEvent(e)}
                    className="w-full text-left text-xs p-2 rounded-lg hover:opacity-90"
                    style={{
                      background: `color-mix(in oklab, ${cal.color} 18%, transparent)`,
                    }}
                  >
                    <div className="font-medium truncate">{e.title}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {format(new Date(e.start_at), "p")}
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
  events,
  onPickEvent,
}: {
  events: EventRow[];
  onPickEvent: (e: EventRow) => void;
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
      {events.map((e) => {
        const cal = SUB_CALS.find((s) => s.value === e.sub_calendar)!;
        const r = READINESS.find((x) => x.value === e.readiness);
        return (
          <button
            key={e.id}
            onClick={() => onPickEvent(e)}
            className="w-full p-4 flex items-center gap-4 text-left hover:bg-background/40 transition"
          >
            <div className="w-1 self-stretch rounded-full" style={{ background: cal.color }} />
            <div className="flex-1 min-w-0">
              <div className="font-medium flex items-center gap-2">
                {e.title}
                {r && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{
                      background: `color-mix(in oklab, ${r.color} 22%, transparent)`,
                      color: r.color,
                    }}
                  >
                    {r.label}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {cal.label}
                {e.leader_name && <> · Led by {e.leader_name}</>}
                {e.location && <> · {e.location}</>}
              </div>
            </div>
            <div className="text-sm text-muted-foreground shrink-0 text-right">
              <div>{format(new Date(e.start_at), "EEE, MMM d")}</div>
              <div className="text-xs">{format(new Date(e.start_at), "p")}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
