import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { RRule, type Frequency } from "rrule";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
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
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Repeat,
  X,
} from "lucide-react";
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

const CATEGORIES = [
  "Holiday", "Leadership", "Women", "Men", "Class", "Social",
  "Kids/Youth", "Liturgical", "Meeting", "Church Plant",
  "Community Group", "Love DOT", "Prayer", "Core Team", "Other",
];

const READINESS_COLORS: Record<string, string> = {
  green: "oklch(0.7 0.18 145)",
  yellow: "oklch(0.82 0.16 90)",
  red: "oklch(0.65 0.22 25)",
};

const WEEKDAYS = [
  { v: "SU", label: "S" },
  { v: "MO", label: "M" },
  { v: "TU", label: "T" },
  { v: "WE", label: "W" },
  { v: "TH", label: "T" },
  { v: "FR", label: "F" },
  { v: "SA", label: "S" },
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
  all_day: boolean;
  category: string | null;
  pco_registration: boolean;
  rrule: string | null;
  recurrence_end_date: string | null;
  excluded_dates: string[];
};

type Occurrence = EventRow & { occurrence_date: Date };

type ChecklistItem = {
  id: string;
  event_id: string;
  label: string;
  done: boolean;
  position: number;
};

type FormState = {
  id?: string;
  title: string;
  sub_calendar: string;
  category: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  leader_name: string;
  location: string;
  readiness: string;
  description: string;
  pco_registration: boolean;
  recurs: boolean;
  freq: "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  byweekday: string[];
  bysetpos: string; // "" | "1".."4" | "-1" (last)
  recurrence_end_date: string;
};

const emptyForm = (start = ""): FormState => ({
  title: "",
  sub_calendar: "general",
  category: "",
  start_at: start,
  end_at: "",
  all_day: false,
  leader_name: "",
  location: "",
  readiness: "green",
  description: "",
  pco_registration: false,
  recurs: false,
  freq: "WEEKLY",
  interval: 1,
  byweekday: [],
  bysetpos: "",
  recurrence_end_date: "",
});

function buildRRule(f: FormState, startDate: Date): string | null {
  if (!f.recurs) return null;
  const freqMap: Record<string, Frequency> = {
    WEEKLY: RRule.WEEKLY, MONTHLY: RRule.MONTHLY, YEARLY: RRule.YEARLY,
  };
  const wdMap: Record<string, number> = {
    SU: RRule.SU.weekday, MO: RRule.MO.weekday, TU: RRule.TU.weekday,
    WE: RRule.WE.weekday, TH: RRule.TH.weekday, FR: RRule.FR.weekday, SA: RRule.SA.weekday,
  };
  const opts: ConstructorParameters<typeof RRule>[0] = {
    freq: freqMap[f.freq],
    interval: f.interval || 1,
    dtstart: startDate,
  };
  if (f.byweekday.length) opts.byweekday = f.byweekday.map((w) => wdMap[w]);
  if (f.bysetpos) opts.bysetpos = [parseInt(f.bysetpos, 10)];
  if (f.recurrence_end_date) opts.until = new Date(f.recurrence_end_date + "T23:59:59");
  return new RRule(opts).toString();
}

function expandEvents(events: EventRow[], rangeStart: Date, rangeEnd: Date): Occurrence[] {
  const out: Occurrence[] = [];
  for (const e of events) {
    const start = new Date(e.start_at);
    if (!e.rrule) {
      if (start >= rangeStart && start <= rangeEnd) {
        out.push({ ...e, occurrence_date: start });
      }
      continue;
    }
    try {
      const rule = RRule.fromString(e.rrule);
      const dates = rule.between(rangeStart, rangeEnd, true);
      const skip = new Set(e.excluded_dates ?? []);
      for (const d of dates) {
        const iso = format(d, "yyyy-MM-dd");
        if (skip.has(iso)) continue;
        out.push({ ...e, occurrence_date: d });
      }
    } catch {
      if (start >= rangeStart && start <= rangeEnd) {
        out.push({ ...e, occurrence_date: start });
      }
    }
  }
  return out.sort((a, b) => a.occurrence_date.getTime() - b.occurrence_date.getTime());
}

function deriveReadiness(items: ChecklistItem[], manual: string | null): string {
  if (items.length === 0) return manual ?? "green";
  const done = items.filter((i) => i.done).length;
  if (done === 0) return "red";
  if (done === items.length) return "green";
  return "yellow";
}

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
    forest_hills_main: true, coah_lm: true, youth: true, general: true,
  });
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editingOccurrence, setEditingOccurrence] = useState<Date | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newItem, setNewItem] = useState("");

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

  const formIdRef = useRef<string | undefined>(undefined);
  useEffect(() => { formIdRef.current = form.id; }, [form.id]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("calendar_events")
      .on("postgres_changes", { event: "*", schema: "public", table: "calendar_events" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "event_checklist_items" }, (payload: any) => {
        const eid = formIdRef.current;
        if (!eid) return;
        const row = payload.new ?? payload.old;
        if (row?.event_id === eid) loadChecklist(eid);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [range.start.getTime(), range.end.getTime()]);

  async function load() {
    // Fetch events overlapping range, plus any recurring (which may have started earlier)
    const { data } = await supabase
      .from("calendar_events")
      .select("*")
      .or(`and(start_at.gte.${range.start.toISOString()},start_at.lte.${range.end.toISOString()}),rrule.not.is.null`)
      .order("start_at", { ascending: true });
    setEvents(data ?? []);
  }

  async function loadChecklist(eventId: string) {
    const { data } = await supabase
      .from("event_checklist_items")
      .select("*")
      .eq("event_id", eventId)
      .order("position", { ascending: true });
    setChecklist(data ?? []);
  }

  function openNew(date?: Date) {
    if (!canEdit) return;
    const base = date ?? new Date();
    base.setHours(9, 0, 0, 0);
    setForm(emptyForm(format(base, "yyyy-MM-dd'T'HH:mm")));
    setEditingOccurrence(null);
    setChecklist([]);
    setOpen(true);
  }

  function openEdit(occ: Occurrence) {
    if (!canEdit) return;
    const ev = occ;
    let freq: FormState["freq"] = "WEEKLY";
    let interval = 1;
    let byweekday: string[] = [];
    let bysetpos = "";
    if (ev.rrule) {
      try {
        const r = RRule.fromString(ev.rrule);
        const o = r.origOptions;
        if (o.freq === RRule.MONTHLY) freq = "MONTHLY";
        else if (o.freq === RRule.YEARLY) freq = "YEARLY";
        interval = o.interval ?? 1;
        if (o.byweekday) {
          const arr = Array.isArray(o.byweekday) ? o.byweekday : [o.byweekday];
          byweekday = arr.map((w) => {
            const wd = typeof w === "number" ? w : (w as { weekday: number }).weekday;
            return ["MO","TU","WE","TH","FR","SA","SU"][wd];
          });
        }
        if (o.bysetpos) {
          const arr = Array.isArray(o.bysetpos) ? o.bysetpos : [o.bysetpos];
          bysetpos = String(arr[0]);
        }
      } catch { /* ignore */ }
    }
    setForm({
      id: ev.id,
      title: ev.title,
      sub_calendar: ev.sub_calendar,
      category: ev.category ?? "",
      start_at: format(new Date(ev.start_at), "yyyy-MM-dd'T'HH:mm"),
      end_at: ev.end_at ? format(new Date(ev.end_at), "yyyy-MM-dd'T'HH:mm") : "",
      all_day: ev.all_day,
      leader_name: ev.leader_name ?? "",
      location: ev.location ?? "",
      readiness: ev.readiness ?? "green",
      description: ev.description ?? "",
      pco_registration: ev.pco_registration,
      recurs: !!ev.rrule,
      freq, interval, byweekday, bysetpos,
      recurrence_end_date: ev.recurrence_end_date ?? "",
    });
    setEditingOccurrence(occ.occurrence_date);
    loadChecklist(ev.id);
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // For all-day events, normalize to UTC noon on the picked date so the calendar
    // day is stable across timezones. For timed events, use the local datetime as-is.
    const toStart = (raw: string, allDay: boolean) => {
      if (!raw) return new Date();
      if (allDay) {
        const datePart = raw.slice(0, 10); // YYYY-MM-DD
        return new Date(`${datePart}T12:00:00Z`);
      }
      return new Date(raw);
    };
    const startDate = toStart(form.start_at, form.all_day);
    const endDate = form.end_at ? toStart(form.end_at, form.all_day) : null;
    const rrule = buildRRule(form, startDate);
    const payload = {
      title: form.title,
      sub_calendar: form.sub_calendar as "general",
      start_at: startDate.toISOString(),
      end_at: endDate ? endDate.toISOString() : null,
      all_day: form.all_day,
      category: form.category || null,
      leader_name: form.leader_name || null,
      location: form.location || null,
      readiness: form.readiness as "green" | "yellow" | "red",
      description: form.description || null,
      pco_registration: form.pco_registration,
      rrule,
      recurrence_end_date: form.recurrence_end_date || null,
    };
    const { error } = form.id
      ? await supabase.from("calendar_events").update(payload).eq("id", form.id)
      : await supabase.from("calendar_events").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(form.id ? "Event updated" : "Event added");
    setOpen(false);
    load();
  }

  async function remove() {
    if (!form.id) return;
    const { error } = await supabase.from("calendar_events").delete().eq("id", form.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Event deleted");
    setOpen(false);
    load();
  }

  async function skipOccurrence() {
    if (!form.id || !editingOccurrence) return;
    const iso = format(editingOccurrence, "yyyy-MM-dd");
    const ev = events.find((x) => x.id === form.id);
    const next = Array.from(new Set([...(ev?.excluded_dates ?? []), iso]));
    const { error } = await supabase
      .from("calendar_events")
      .update({ excluded_dates: next })
      .eq("id", form.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Occurrence skipped");
    setOpen(false);
    load();
  }

  async function addChecklistItem() {
    if (!form.id || !newItem.trim()) return;
    const { error } = await supabase
      .from("event_checklist_items")
      .insert({ event_id: form.id, label: newItem.trim(), position: checklist.length });
    if (error) { toast.error(error.message); return; }
    setNewItem("");
    loadChecklist(form.id);
  }

  async function toggleChecklistItem(item: ChecklistItem) {
    const { error } = await supabase
      .from("event_checklist_items")
      .update({ done: !item.done })
      .eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    loadChecklist(form.id!);
  }

  async function deleteChecklistItem(id: string) {
    const { error } = await supabase.from("event_checklist_items").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    loadChecklist(form.id!);
  }

  const occurrences = useMemo(
    () => expandEvents(events, range.start, range.end),
    [events, range.start.getTime(), range.end.getTime()],
  );

  const visible = occurrences.filter(
    (o) => filters[o.sub_calendar] && (categoryFilter === "all" || o.category === categoryFilter),
  );

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
          <Button variant="ghost" size="icon"
            onClick={() => setCursor(view === "week" ? addWeeks(cursor, -1) : addMonths(cursor, -1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="font-display text-lg min-w-[10rem] text-center">
            {format(cursor, view === "week" ? "MMM d, yyyy" : "MMMM yyyy")}
          </div>
          <Button variant="ghost" size="icon"
            onClick={() => setCursor(view === "week" ? addWeeks(cursor, 1) : addMonths(cursor, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>Today</Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-8 w-[10rem] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
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
              <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: s.color }} />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {view === "month" && <MonthGrid cursor={cursor} occurrences={visible} onPickDay={openNew} onPickEvent={openEdit} canEdit={canEdit} />}
      {view === "week" && <WeekStrip cursor={cursor} occurrences={visible} onPickDay={openNew} onPickEvent={openEdit} canEdit={canEdit} />}
      {view === "list" && <ListView occurrences={visible} onPickEvent={openEdit} />}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit event" : "Add event"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Sub-calendar</Label>
                <Select value={form.sub_calendar} onValueChange={(v) => setForm({ ...form, sub_calendar: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUB_CALS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category || "_none"} onValueChange={(v) => setForm({ ...form, category: v === "_none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-6 text-sm">
              <label className="flex items-center gap-2">
                <Switch checked={form.all_day} onCheckedChange={(v) => setForm({ ...form, all_day: v })} />
                All day
              </label>
              <label className="flex items-center gap-2">
                <Switch checked={form.pco_registration} onCheckedChange={(v) => setForm({ ...form, pco_registration: v })} />
                PCO registration
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Starts</Label>
                <Input
                  type={form.all_day ? "date" : "datetime-local"}
                  value={form.all_day ? form.start_at.slice(0, 10) : form.start_at}
                  onChange={(e) => setForm({ ...form, start_at: form.all_day ? e.target.value + "T00:00" : e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Ends</Label>
                <Input
                  type={form.all_day ? "date" : "datetime-local"}
                  value={form.all_day ? (form.end_at ? form.end_at.slice(0, 10) : "") : form.end_at}
                  onChange={(e) => setForm({ ...form, end_at: form.all_day ? (e.target.value ? e.target.value + "T23:59" : "") : e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Leader</Label>
                <Input value={form.leader_name} onChange={(e) => setForm({ ...form, leader_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>

            {/* Recurrence */}
            <div className="space-y-3 rounded-xl border border-border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Switch checked={form.recurs} onCheckedChange={(v) => setForm({ ...form, recurs: v })} />
                <Repeat className="w-4 h-4" /> Repeats
              </label>
              {form.recurs && (
                <div className="space-y-3 pl-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span>Every</span>
                    <Input
                      type="number" min={1} className="w-16 h-8"
                      value={form.interval}
                      onChange={(e) => setForm({ ...form, interval: parseInt(e.target.value) || 1 })}
                    />
                    <Select value={form.freq} onValueChange={(v) => setForm({ ...form, freq: v as FormState["freq"] })}>
                      <SelectTrigger className="h-8 w-[8rem]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="WEEKLY">week(s)</SelectItem>
                        <SelectItem value="MONTHLY">month(s)</SelectItem>
                        <SelectItem value="YEARLY">year(s)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {form.freq === "WEEKLY" && (
                    <div className="flex gap-1">
                      {WEEKDAYS.map((w) => {
                        const on = form.byweekday.includes(w.v);
                        return (
                          <button
                            key={w.v} type="button"
                            onClick={() => setForm({
                              ...form,
                              byweekday: on
                                ? form.byweekday.filter((x) => x !== w.v)
                                : [...form.byweekday, w.v],
                            })}
                            className={`w-8 h-8 text-xs rounded-full border ${
                              on ? "bg-primary text-primary-foreground border-primary" : "border-border"
                            }`}
                          >{w.label}</button>
                        );
                      })}
                    </div>
                  )}

                  {form.freq === "MONTHLY" && (
                    <div className="space-y-2 text-sm">
                      <div className="text-xs text-muted-foreground">
                        For "last Sunday of the month": pick "Last" + tap Sun below.
                      </div>
                      <div className="flex items-center gap-2">
                        <Select value={form.bysetpos || "_dom"} onValueChange={(v) => setForm({ ...form, bysetpos: v === "_dom" ? "" : v, byweekday: v === "_dom" ? [] : form.byweekday })}>
                          <SelectTrigger className="h-8 w-[10rem]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_dom">On day {format(new Date(form.start_at || Date.now()), "d")}</SelectItem>
                            <SelectItem value="1">First</SelectItem>
                            <SelectItem value="2">Second</SelectItem>
                            <SelectItem value="3">Third</SelectItem>
                            <SelectItem value="4">Fourth</SelectItem>
                            <SelectItem value="-1">Last</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {form.bysetpos && (
                        <div className="flex gap-1">
                          {WEEKDAYS.map((w) => {
                            const on = form.byweekday.includes(w.v);
                            return (
                              <button
                                key={w.v} type="button"
                                onClick={() => setForm({ ...form, byweekday: on ? [] : [w.v] })}
                                className={`w-8 h-8 text-xs rounded-full border ${
                                  on ? "bg-primary text-primary-foreground border-primary" : "border-border"
                                }`}
                              >{w.label}</button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-xs">Ends on (optional)</Label>
                    <Input
                      type="date"
                      value={form.recurrence_end_date}
                      onChange={(e) => setForm({ ...form, recurrence_end_date: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Checklist */}
            {form.id && (
              <div className="space-y-2 rounded-xl border border-border p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Readiness checklist</Label>
                  <ReadinessBadge value={deriveReadiness(checklist, form.readiness)} />
                </div>
                <div className="space-y-1">
                  {checklist.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 group">
                      <Checkbox checked={item.done} onCheckedChange={() => toggleChecklistItem(item)} />
                      <span className={`flex-1 text-sm ${item.done ? "line-through text-muted-foreground" : ""}`}>
                        {item.label}
                      </span>
                      <button type="button" onClick={() => deleteChecklistItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add an item…"
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); addChecklistItem(); }
                    }}
                    className="h-8"
                  />
                  <Button type="button" size="sm" variant="secondary" onClick={addChecklistItem}>Add</Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Readiness color is auto-derived from the checklist. Manual fallback when empty:
                  <Select value={form.readiness} onValueChange={(v) => setForm({ ...form, readiness: v })}>
                    <SelectTrigger className="h-7 w-[8rem] mt-1 inline-flex"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="green">Green</SelectItem>
                      <SelectItem value="yellow">Yellow</SelectItem>
                      <SelectItem value="red">Red</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <DialogFooter className="flex sm:justify-between gap-2 flex-wrap">
              <div className="flex gap-2">
                {form.id && (
                  <Button type="button" variant="ghost" onClick={remove}>
                    <Trash2 className="w-4 h-4 mr-1.5" /> Delete series
                  </Button>
                )}
                {form.id && form.recurs && editingOccurrence && (
                  <Button type="button" variant="ghost" onClick={skipOccurrence}>
                    Skip this date
                  </Button>
                )}
              </div>
              <Button type="submit">{form.id ? "Save changes" : "Add event"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReadinessBadge({ value }: { value: string }) {
  const color = READINESS_COLORS[value] ?? READINESS_COLORS.green;
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full capitalize"
      style={{
        background: `color-mix(in oklab, ${color} 22%, transparent)`,
        color,
      }}
    >{value}</span>
  );
}

function EventChip({ occ, compact }: { occ: Occurrence; compact?: boolean }) {
  const cal = SUB_CALS.find((s) => s.value === occ.sub_calendar)!;
  return (
    <div
      className={`text-[10px] truncate px-1.5 py-0.5 rounded hover:opacity-80 ${compact ? "" : ""}`}
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
  cursor, occurrences, onPickDay, onPickEvent, canEdit,
}: {
  cursor: Date;
  occurrences: Occurrence[];
  onPickDay: (d: Date) => void;
  onPickEvent: (o: Occurrence) => void;
  canEdit: boolean;
}) {
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
  const days: Date[] = [];
  for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) days.push(new Date(d));

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border text-xs text-muted-foreground">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
          <div key={d} className="px-2 py-2 text-center font-medium">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 auto-rows-[minmax(6rem,1fr)]">
        {days.map((day) => {
          const dayEvents = occurrences.filter((o) => isSameDay(o.occurrence_date, day));
          const dim = !isSameMonth(day, cursor);
          return (
            <button
              key={day.toISOString()}
              onClick={() => canEdit && onPickDay(day)}
              className={`text-left p-1.5 border-r border-b border-border/60 last:border-r-0 hover:bg-background/50 transition flex flex-col gap-1 ${
                dim ? "bg-background/30" : ""
              }`}
            >
              <div className={`text-xs font-medium ${
                isToday(day) ? "text-primary" : dim ? "text-muted-foreground/50" : "text-foreground"
              }`}>{format(day, "d")}</div>
              <div className="space-y-0.5 overflow-hidden">
                {dayEvents.slice(0, 3).map((o, i) => (
                  <div key={`${o.id}-${i}`} onClick={(e) => { e.stopPropagation(); onPickEvent(o); }}>
                    <EventChip occ={o} />
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-muted-foreground px-1.5">+{dayEvents.length - 3} more</div>
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
  cursor, occurrences, onPickDay, onPickEvent, canEdit,
}: {
  cursor: Date;
  occurrences: Occurrence[];
  onPickDay: (d: Date) => void;
  onPickEvent: (o: Occurrence) => void;
  canEdit: boolean;
}) {
  const start = startOfWeek(cursor, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * 86400000));

  return (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
      {days.map((day) => {
        const dayEvents = occurrences.filter((o) => isSameDay(o.occurrence_date, day));
        return (
          <div key={day.toISOString()} className="bg-surface border border-border rounded-xl p-3 min-h-[10rem]">
            <button onClick={() => canEdit && onPickDay(day)} className="w-full text-left mb-2">
              <div className="text-xs text-muted-foreground">{format(day, "EEE")}</div>
              <div className={`text-lg font-display ${isToday(day) ? "text-primary" : ""}`}>{format(day, "d")}</div>
            </button>
            <div className="space-y-1">
              {dayEvents.map((o, i) => {
                const cal = SUB_CALS.find((s) => s.value === o.sub_calendar)!;
                return (
                  <button
                    key={`${o.id}-${i}`}
                    onClick={() => onPickEvent(o)}
                    className="w-full text-left text-xs p-2 rounded-lg hover:opacity-90"
                    style={{ background: `color-mix(in oklab, ${cal.color} 18%, transparent)` }}
                  >
                    <div className="font-medium truncate">{o.title}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {o.all_day ? "All day" : format(o.occurrence_date, "p")}
                    </div>
                  </button>
                );
              })}
              {dayEvents.length === 0 && <div className="text-[11px] text-muted-foreground/60">—</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListView({ occurrences, onPickEvent }: { occurrences: Occurrence[]; onPickEvent: (o: Occurrence) => void }) {
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
        const cal = SUB_CALS.find((s) => s.value === o.sub_calendar)!;
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
                {o.readiness && <ReadinessBadge value={o.readiness} />}
                {o.pco_registration && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">PCO</span>
                )}
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
              <div className="text-xs">{o.all_day ? "All day" : format(o.occurrence_date, "p")}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
