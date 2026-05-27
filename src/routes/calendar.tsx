import { createFileRoute, Link } from "@tanstack/react-router";
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
import { PlanningBanner } from "@/components/calendar/PlanningBanner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { classGaps } from "@/lib/class-gaps";
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
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
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
  CalendarDays,
  UserPlus,
  UserMinus,
  CheckCircle2,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useServerFn } from "@tanstack/react-start";
import {
  assignChecklistItem,
  unassignChecklistItem,
  setChecklistItemDone,
} from "@/lib/checklist-tasks.functions";
import { notifyCommentMentions } from "@/lib/event-comments.functions";

import { toast } from "sonner";
import { useUndoableAction } from "@/lib/use-undoable-action";
import { scoreEvent, readinessColor } from "@/lib/event-readiness";
import { findConflicts, type ConflictEvent } from "@/lib/event-conflicts";
import { AlertTriangle } from "lucide-react";


export const Route = createFileRoute("/calendar")({
  validateSearch: (s: Record<string, unknown>) => ({
    event: typeof s.event === "string" ? s.event : undefined,
  }),
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

const LISTING_CHANNELS: { key: string; label: string }[] = [
  { key: "pco", label: "PCO" },
  { key: "eventbrite", label: "Eventbrite" },
  { key: "google", label: "Google" },
  { key: "community_cals", label: "Community Cals" },
  { key: "socials", label: "Socials" },
];
const LISTING_LABEL = new Map(LISTING_CHANNELS.map((c) => [c.key, c.label]));

const COMMS_CHANNELS: { key: string; label: string }[] = [
  { key: "direct_email", label: "Direct Email" },
  { key: "push_notification", label: "Push Notification" },
  { key: "sunday_slide", label: "Sunday Slide" },
  { key: "sunday_announcement", label: "Sunday Announcement" },
  { key: "newsletter", label: "Newsletter" },
  { key: "text_message", label: "Text Message" },
];

const LISTING_CHECKLIST_LABEL: Record<string, string> = {
  pco: "Set up PCO registration",
  eventbrite: "List on Eventbrite",
  google: "List on Google",
  community_cals: "List on community calendars",
  socials: "Post on socials",
  social_ads: "Run social ads",
  direct_email: "Send direct email",
  push_notification: "Send push notification",
  sunday_slide: "Add to Sunday slides",
  sunday_announcement: "Add to Sunday announcements",
  newsletter: "Include in newsletter",
  text_message: "Send text message",
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
  other_listings: string[];
  social_ads: boolean;
  room_needed: string | null;
  action_note: string | null;
  missions_team_needed: boolean;
  church_covering: string | null;
  childcare_needed: boolean;
  childcare_arranged: boolean;
  room_not_needed: boolean;
  leader_not_needed: boolean;
  room_request_submitted: boolean;
  room_approval_received: boolean;
  class_series_id: string | null;
};


type Occurrence = EventRow & { occurrence_date: Date };

type ChecklistItem = {
  id: string;
  event_id: string;
  label: string;
  done: boolean;
  position: number;
  assignee_id: string | null;
  due_date: string | null;
  action_item_id: string | null;
};

type UserOption = { id: string; full_name: string | null; email: string | null };


type ClassSeries = {
  id: string;
  name: string;
  default_leader_name: string | null;
  default_teacher_name: string | null;
  default_childcare_needed: boolean;
  default_room_id: string | null;
};

type Room = { id: string; name: string };

type ChecklistTemplate = { id: string; name: string; description: string | null };
type TemplateItem = { id: string; template_id: string; label: string; position: number };

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
  bysetpos: string;
  recurrence_end_date: string;
  other_listings: string[];
  social_ads: boolean;
  room_needed: string;
  action_note: string;
  missions_team_needed: boolean;
  church_covering: string;
  childcare_needed: boolean;
  childcare_arranged: boolean;
  room_not_needed: boolean;
  leader_not_needed: boolean;
  class_series_id: string;
  room_ids: string[];
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
  other_listings: [],
  social_ads: false,
  room_needed: "",
  action_note: "",
  missions_team_needed: false,
  church_covering: "",
  childcare_needed: false,
  childcare_arranged: false,
  room_not_needed: false,
  leader_not_needed: false,
  class_series_id: "",
  room_ids: [],
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
  const { hasRole, user } = useAuth();
  const canEdit = hasRole("core");
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const handledEventRef = useRef<string | null>(null);
  const [view, setView] = useState<"month" | "week" | "list">("list");
  const [hidePast, setHidePast] = useState(false);
  const [cursor, setCursor] = useState(new Date());
  const [events, setEvents] = useState<EventRow[]>([]);
  const [filters, setFilters] = useState<Record<string, boolean>>({
    forest_hills_main: true, coah_lm: true, youth: true, general: true,
  });
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [flagFilter, setFlagFilter] = useState<"all" | "pco" | "missions">("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editingOccurrence, setEditingOccurrence] = useState<Date | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
  const [editingChecklistLabel, setEditingChecklistLabel] = useState("");
  const [newItem, setNewItem] = useState("");
  const [classSeries, setClassSeries] = useState<ClassSeries[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [pendingRoom, setPendingRoom] = useState<{ id: string; name: string; step: "request" | "approval" } | null>(null);
  const [roomRequestSubmitted, setRoomRequestSubmitted] = useState(false);
  const [roomApprovalReceived, setRoomApprovalReceived] = useState(false);
  const [assignableUsers, setAssignableUsers] = useState<UserOption[]>([]);
  const assignFn = useServerFn(assignChecklistItem);
  const unassignFn = useServerFn(unassignChecklistItem);
  const setDoneFn = useServerFn(setChecklistItemDone);
  const eventRoomsMap = useRef<Map<string, string[]>>(new Map());
  const eventChecklistMap = useRef<Map<string, { total: number; done: number }>>(new Map());
  const eventAttachmentsMap = useRef<Map<string, string[]>>(new Map());
  const templateStateMap = useRef<Map<string, boolean>>(new Map()); // key: `${event_id}:${item_id}:${YYYY-MM-DD}`
  const undo = useUndoableAction();

  // Checklist templates
  const [allTemplates, setAllTemplates] = useState<ChecklistTemplate[]>([]);
  const [allTemplateItems, setAllTemplateItems] = useState<TemplateItem[]>([]);
  const [eventTemplateIds, setEventTemplateIds] = useState<string[]>([]); // attached to current form event
  const [templateStates, setTemplateStates] = useState<Record<string, boolean>>({}); // key: `${item_id}:${YYYY-MM-DD}`

  function readinessFor(occ: Occurrence) {
    const roomIds = eventRoomsMap.current.get(occ.id) ?? [];
    const has_room = roomIds.length > 0 || (occ.room_needed ?? "").trim().length > 0;
    const adHoc = eventChecklistMap.current.get(occ.id) ?? { total: 0, done: 0 };
    const tplIds = eventAttachmentsMap.current.get(occ.id) ?? [];
    const tplItems = allTemplateItems.filter((i) => tplIds.includes(i.template_id));
    const dateKey = format(occ.occurrence_date, "yyyy-MM-dd");
    let tplDone = 0;
    for (const it of tplItems) {
      if (templateStateMap.current.get(`${occ.id}:${it.id}:${dateKey}`)) tplDone++;
    }
    return scoreEvent({
      category: occ.category,
      leader_name: occ.leader_name,
      childcare_needed: occ.childcare_needed,
      childcare_arranged: occ.childcare_arranged,
      has_room,
      room_not_needed: (occ as any).room_not_needed ?? false,
      leader_not_needed: (occ as any).leader_not_needed ?? false,
      checklist_total: adHoc.total + tplItems.length,
      checklist_done: adHoc.done + tplDone,
    });
  }


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
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name");
      setAssignableUsers((data ?? []) as UserOption[]);
    })();
  }, []);



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

  useEffect(() => {
    const target = search.event;
    if (!target || handledEventRef.current === target) return;
    const ev = events.find((e) => e.id === target);
    if (!ev) return;
    handledEventRef.current = target;
    openEdit({ ...ev, occurrence_date: new Date(ev.start_at) } as Occurrence);
    navigate({ search: (prev: { event?: string }) => ({ ...prev, event: undefined }), replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.event, events]);

  async function load() {
    // Fetch events overlapping range, plus any recurring (which may have started earlier)
    const [{ data }, { data: er }, { data: cs }, { data: rs }, { data: tpls }, { data: tplItems }, { data: atts }, { data: states }] = await Promise.all([
      supabase
        .from("calendar_events")
        .select("*")
        .or(`and(start_at.gte.${range.start.toISOString()},start_at.lte.${range.end.toISOString()}),rrule.not.is.null`)
        .order("start_at", { ascending: true }),
      supabase.from("event_rooms").select("event_id, room_id"),
      supabase.from("class_series").select("id, name, default_leader_name, default_teacher_name, default_childcare_needed, default_room_id").eq("active", true).order("name"),
      supabase.from("rooms").select("id, name").eq("active", true).order("name"),
      supabase.from("checklist_templates" as any).select("*").order("name"),
      supabase.from("checklist_template_items" as any).select("*").order("position"),
      supabase.from("event_template_attachments" as any).select("event_id, template_id"),
      supabase.from("event_template_item_state" as any).select("event_id, template_item_id, occurrence_date, done"),
    ]);
    setEvents(data ?? []);
    const map = new Map<string, string[]>();
    for (const row of er ?? []) {
      const arr = map.get(row.event_id) ?? [];
      arr.push(row.room_id);
      map.set(row.event_id, arr);
    }
    eventRoomsMap.current = map;
    setClassSeries((cs ?? []) as ClassSeries[]);
    setRooms((rs ?? []) as Room[]);
    setAllTemplates(((tpls ?? []) as unknown) as ChecklistTemplate[]);
    setAllTemplateItems(((tplItems ?? []) as unknown) as TemplateItem[]);

    // Per-event ad-hoc checklist counts (for readiness scoring everywhere)
    const { data: cli } = await supabase
      .from("event_checklist_items")
      .select("event_id, done");
    const cMap = new Map<string, { total: number; done: number }>();
    for (const row of (cli ?? []) as Array<{ event_id: string; done: boolean }>) {
      const cur = cMap.get(row.event_id) ?? { total: 0, done: 0 };
      cur.total += 1;
      if (row.done) cur.done += 1;
      cMap.set(row.event_id, cur);
    }
    eventChecklistMap.current = cMap;

    // Per-event template attachments
    const aMap = new Map<string, string[]>();
    for (const row of (atts ?? []) as unknown as Array<{ event_id: string; template_id: string }>) {
      const arr = aMap.get(row.event_id) ?? [];
      arr.push(row.template_id);
      aMap.set(row.event_id, arr);
    }
    eventAttachmentsMap.current = aMap;

    // Per-occurrence template item state
    const sMap = new Map<string, boolean>();
    for (const row of (states ?? []) as unknown as Array<{ event_id: string; template_item_id: string; occurrence_date: string; done: boolean }>) {
      sMap.set(`${row.event_id}:${row.template_item_id}:${row.occurrence_date}`, row.done);
    }
    templateStateMap.current = sMap;
  }

  async function loadChecklist(eventId: string) {
    const { data } = await supabase
      .from("event_checklist_items")
      .select("*")
      .eq("event_id", eventId)
      .order("position", { ascending: true });
    setChecklist(data ?? []);
  }

  async function loadTemplatesForEvent(eventId: string, occurrenceDate: Date) {
    const dateKey = format(occurrenceDate, "yyyy-MM-dd");
    const [{ data: atts }, { data: states }] = await Promise.all([
      supabase.from("event_template_attachments" as any).select("template_id").eq("event_id", eventId),
      supabase.from("event_template_item_state" as any)
        .select("template_item_id, done")
        .eq("event_id", eventId)
        .eq("occurrence_date", dateKey),
    ]);
    setEventTemplateIds(((atts ?? []) as unknown as Array<{ template_id: string }>).map((a) => a.template_id));
    const m: Record<string, boolean> = {};
    for (const row of ((states ?? []) as unknown as Array<{ template_item_id: string; done: boolean }>)) {
      m[`${row.template_item_id}:${dateKey}`] = row.done;
    }
    setTemplateStates(m);
  }


  function openNew(date?: Date) {
    if (!canEdit) return;
    const base = date ?? new Date();
    base.setHours(9, 0, 0, 0);
    setForm(emptyForm(format(base, "yyyy-MM-dd'T'HH:mm")));
    setEditingOccurrence(null);
    setChecklist([]);
    setEventTemplateIds([]);
    setTemplateStates({});
    setRoomRequestSubmitted(false);
    setRoomApprovalReceived(false);
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
      other_listings: ev.other_listings ?? [],
      social_ads: (ev as any).social_ads ?? false,
      room_needed: ev.room_needed ?? "",
      action_note: ev.action_note ?? "",
      missions_team_needed: ev.missions_team_needed ?? false,
      church_covering: ev.church_covering ?? "",
      childcare_needed: ev.childcare_needed ?? false,
      childcare_arranged: ev.childcare_arranged ?? false,
      room_not_needed: (ev as any).room_not_needed ?? false,
      leader_not_needed: (ev as any).leader_not_needed ?? false,
      class_series_id: ev.class_series_id ?? "",
      room_ids: eventRoomsMap.current.get(ev.id) ?? [],
    });

    setEditingOccurrence(occ.occurrence_date);
    loadChecklist(ev.id);
    loadTemplatesForEvent(ev.id, occ.occurrence_date);
    setRoomRequestSubmitted((ev as any).room_request_submitted ?? false);
    setRoomApprovalReceived((ev as any).room_approval_received ?? false);
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
      other_listings: form.other_listings,
      social_ads: form.social_ads,
      room_needed: form.room_needed || null,
      action_note: form.action_note || null,
      missions_team_needed: form.missions_team_needed,
      church_covering: form.church_covering || null,
      childcare_needed: form.childcare_needed,
      childcare_arranged: form.childcare_arranged,
      room_not_needed: form.room_not_needed,
      leader_not_needed: form.leader_not_needed,
      class_series_id: form.class_series_id || null,
    };
    const result = form.id
      ? await supabase.from("calendar_events").update(payload).eq("id", form.id).select("id").single()
      : await supabase.from("calendar_events").insert(payload).select("id").single();
    if (result.error) { toast.error(result.error.message); return; }
    const savedId = result.data?.id ?? form.id;
    if (savedId) {
      await supabase.from("event_rooms").delete().eq("event_id", savedId);
      if (form.room_ids.length > 0) {
        await supabase.from("event_rooms").insert(form.room_ids.map((rid) => ({ event_id: savedId, room_id: rid })));
      }
      // Reconcile listing-channel checklist items with currently-enabled toggles
      const enabledChannels: string[] = [
        ...(form.pco_registration ? ["pco"] : []),
        ...form.other_listings,
        ...(form.social_ads ? ["social_ads"] : []),
      ];
      for (const key of Object.keys(LISTING_CHECKLIST_LABEL)) {
        await syncListingChecklist(savedId, key, enabledChannels.includes(key));
      }
    }
    const gaps = classGaps(form);
    if (gaps.length > 0) {
      toast.warning(`Saved. Still needed: ${gaps.join(", ")}.`);
    } else {
      toast.success(form.id ? "Event updated" : "Event added");
    }
    setOpen(false);
    load();
  }


  async function remove() {
    if (!form.id) return;
    const id = form.id;
    const prev = events;
    setOpen(false);
    undo({
      optimistic: () => {
        setEvents((list) => list.filter((e) => e.id !== id));
        return prev;
      },
      rollback: (snap) => setEvents(snap),
      commit: async () => {
        const { error } = await supabase.from("calendar_events").delete().eq("id", id);
        if (error) throw new Error(error.message);
        load();
      },
      message: "Event deleted",
      description: "Tap undo to restore.",
    });
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

  async function saveOccurrenceOnly() {
    if (!form.id || !editingOccurrence) return;
    const toStart = (raw: string, allDay: boolean) => {
      if (!raw) return new Date();
      if (allDay) {
        const datePart = raw.slice(0, 10);
        return new Date(`${datePart}T12:00:00Z`);
      }
      return new Date(raw);
    };
    const startDate = toStart(form.start_at, form.all_day);
    const endDate = form.end_at ? toStart(form.end_at, form.all_day) : null;
    // 1) Insert one-off event with modifications (no rrule)
    const { error: insertErr } = await supabase.from("calendar_events").insert({
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
      rrule: null,
      recurrence_end_date: null,
      other_listings: form.other_listings,
      social_ads: form.social_ads,
      room_needed: form.room_needed || null,
      action_note: form.action_note || null,
      missions_team_needed: form.missions_team_needed,
      church_covering: form.church_covering || null,
      childcare_needed: form.childcare_needed,
      childcare_arranged: form.childcare_arranged,
      room_not_needed: form.room_not_needed,
      leader_not_needed: form.leader_not_needed,
    });
    if (insertErr) { toast.error(insertErr.message); return; }
    // 2) Add original occurrence date to excluded_dates on the series
    const iso = format(editingOccurrence, "yyyy-MM-dd");
    const ev = events.find((x) => x.id === form.id);
    const next = Array.from(new Set([...(ev?.excluded_dates ?? []), iso]));
    const { error: updErr } = await supabase
      .from("calendar_events")
      .update({ excluded_dates: next })
      .eq("id", form.id);
    if (updErr) { toast.error(updErr.message); return; }
    toast.success("Occurrence updated");
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

  async function syncListingChecklist(eventId: string, channelKey: string, enabled: boolean) {
    const label = LISTING_CHECKLIST_LABEL[channelKey];
    if (!label) return;
    if (enabled) {
      const { data: existing } = await supabase
        .from("event_checklist_items")
        .select("id")
        .eq("event_id", eventId)
        .eq("label", label)
        .maybeSingle();
      if (!existing) {
        await supabase
          .from("event_checklist_items")
          .insert({ event_id: eventId, label, position: checklist.length });
      }
    } else {
      await supabase
        .from("event_checklist_items")
        .delete()
        .eq("event_id", eventId)
        .eq("label", label);
    }
    if (form.id === eventId) loadChecklist(eventId);
  }

  async function toggleChecklistItem(item: ChecklistItem) {
    try {
      await setDoneFn({ data: { checklistItemId: item.id, done: !item.done } });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update");
      return;
    }
    loadChecklist(form.id!);
  }

  async function deleteChecklistItem(id: string) {
    const { error } = await supabase.from("event_checklist_items").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    loadChecklist(form.id!);
  }

  function currentOccurrenceDate(): Date {
    if (editingOccurrence) return editingOccurrence;
    if (form.start_at) {
      const datePart = form.start_at.slice(0, 10);
      return new Date(`${datePart}T12:00:00`);
    }
    return new Date();
  }

  async function toggleEventTemplate(templateId: string, attached: boolean) {
    if (!form.id) { toast.error("Save the event first"); return; }
    if (attached) {
      const { error } = await supabase
        .from("event_template_attachments" as any)
        .delete()
        .eq("event_id", form.id)
        .eq("template_id", templateId);
      if (error) { toast.error(error.message); return; }
      setEventTemplateIds((ids) => ids.filter((i) => i !== templateId));
    } else {
      const { error } = await supabase
        .from("event_template_attachments" as any)
        .insert({ event_id: form.id, template_id: templateId });
      if (error) { toast.error(error.message); return; }
      setEventTemplateIds((ids) => [...ids, templateId]);
    }
    load();
  }

  async function toggleTemplateItem(itemId: string, currentlyDone: boolean) {
    if (!form.id) return;
    const occDate = currentOccurrenceDate();
    const dateKey = format(occDate, "yyyy-MM-dd");
    const next = !currentlyDone;
    // Optimistic
    setTemplateStates((s) => ({ ...s, [`${itemId}:${dateKey}`]: next }));
    const { error } = await supabase
      .from("event_template_item_state" as any)
      .upsert(
        { event_id: form.id, template_item_id: itemId, occurrence_date: dateKey, done: next },
        { onConflict: "event_id,template_item_id,occurrence_date" },
      );
    if (error) {
      toast.error(error.message);
      setTemplateStates((s) => ({ ...s, [`${itemId}:${dateKey}`]: currentlyDone }));
    } else {
      // Refresh aggregate data for chips
      load();
    }
  }

  const occurrences = useMemo(
    () => expandEvents(events, range.start, range.end),
    [events, range.start.getTime(), range.end.getTime()],
  );

  const startOfToday = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const visible = occurrences.filter((o) => {
    const cals = [o.sub_calendar, ...(o.other_listings ?? [])];
    if (!cals.some((c) => filters[c])) return false;
    if (categoryFilter !== "all" && o.category !== categoryFilter) return false;
    if (flagFilter === "pco" && !o.pco_registration) return false;
    if (flagFilter === "missions" && !o.missions_team_needed) return false;
    if (hidePast && o.occurrence_date < startOfToday) return false;
    return true;
  });

  // Per-occurrence conflict map keyed by `${eventId}-${time}`
  const conflictMap = useMemo(() => {
    const m = new Map<string, number>();
    const items: ConflictEvent[] = visible.map((o) => ({
      id: `${o.id}-${o.occurrence_date.getTime()}`,
      title: o.title,
      start_at: o.occurrence_date.toISOString(),
      end_at: o.end_at,
      all_day: o.all_day,
      leader_name: o.leader_name,
      room_ids: eventRoomsMap.current.get(o.id) ?? [],
    }));
    for (const c of items) {
      const conflicts = findConflicts(c, items);
      if (conflicts.length) m.set(c.id, conflicts.length);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, events]);

  // Conflicts for the currently-edited event (live as the form changes)
  const formConflicts = useMemo(() => {
    if (!open || !form.start_at) return [];
    const startDate = form.all_day
      ? new Date(`${form.start_at.slice(0, 10)}T12:00:00Z`)
      : new Date(form.start_at);
    const endDate = form.end_at
      ? (form.all_day ? new Date(`${form.end_at.slice(0, 10)}T12:00:00Z`) : new Date(form.end_at))
      : null;
    const candidate: ConflictEvent = {
      id: form.id ?? "__new__",
      title: form.title,
      start_at: startDate.toISOString(),
      end_at: endDate ? endDate.toISOString() : null,
      all_day: form.all_day,
      leader_name: form.leader_name,
      room_ids: form.room_ids,
    };
    const existing: ConflictEvent[] = visible
      .filter((o) => o.id !== form.id)
      .map((o) => ({
        id: o.id,
        title: o.title,
        start_at: o.occurrence_date.toISOString(),
        end_at: o.end_at,
        all_day: o.all_day,
        leader_name: o.leader_name,
        room_ids: eventRoomsMap.current.get(o.id) ?? [],
      }));
    return findConflicts(candidate, existing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form, visible]);

  function applySeries(seriesId: string) {
    if (!seriesId) {
      setForm((f) => ({ ...f, class_series_id: "" }));
      return;
    }
    const s = classSeries.find((x) => x.id === seriesId);
    if (!s) return;
    const teacher = s.default_teacher_name || s.default_leader_name || "";
    const roomName = s.default_room_id ? rooms.find((r) => r.id === s.default_room_id)?.name ?? "" : "";
    setForm((f) => ({
      ...f,
      class_series_id: seriesId,
      category: f.category || "Class",
      leader_name: f.leader_name || teacher,
      childcare_needed: f.childcare_needed || s.default_childcare_needed,
      room_needed: f.room_needed || roomName,
      room_ids: f.room_ids.length ? f.room_ids : (s.default_room_id ? [s.default_room_id] : []),
    }));
  }


  return (
    <>
      <PlanningBanner />
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Calendar</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Layered church calendar across all sub-calendars.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={hidePast} onCheckedChange={setHidePast} />
            Hide past
          </label>
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
          <Select value={flagFilter} onValueChange={(v) => setFlagFilter(v as typeof flagFilter)}>
            <SelectTrigger className="h-8 w-[10rem] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              <SelectItem value="pco">Needs PCO registration</SelectItem>
              <SelectItem value="missions">Missions team needed</SelectItem>
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

      {view === "month" && <MonthGrid cursor={cursor} occurrences={visible} conflictMap={conflictMap} onPickDay={openNew} onPickEvent={openEdit} canEdit={canEdit} readinessOf={readinessFor} />}
      {view === "week" && <WeekStrip cursor={cursor} occurrences={visible} onPickDay={openNew} onPickEvent={openEdit} canEdit={canEdit} />}
      {view === "list" && <ListView occurrences={visible} conflictMap={conflictMap} onPickEvent={openEdit} readinessOf={readinessFor} />}


      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto sm:rounded-lg max-sm:!w-screen max-sm:!max-w-none max-sm:!h-[100dvh] max-sm:!rounded-none max-sm:!max-h-none">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="truncate">{form.id ? "Edit event" : "Add event"}</span>
              {form.id && (() => {
                const occDate = currentOccurrenceDate();
                const dateKey = format(occDate, "yyyy-MM-dd");
                const tplItems = allTemplateItems.filter((i) => eventTemplateIds.includes(i.template_id));
                const tplTotal = tplItems.length;
                const tplDone = tplItems.filter((i) => templateStates[`${i.id}:${dateKey}`]).length;
                 const nonOfficeSelected = form.room_ids.some((id) => {
                   const r = rooms.find((rm) => rm.id === id);
                   return r && r.name.trim().toLowerCase() !== "office";
                 });
                 const roomConfirmed = !nonOfficeSelected || (roomRequestSubmitted && roomApprovalReceived);
                 const has_room = roomConfirmed && (form.room_ids.length > 0 || form.room_needed.trim().length > 0);
                 const r = scoreEvent({
                   category: form.category,
                   leader_name: form.leader_name,
                   childcare_needed: form.childcare_needed,
                   childcare_arranged: form.childcare_arranged,
                   has_room,
                   room_not_needed: form.room_not_needed,
                   leader_not_needed: form.leader_not_needed,
                   checklist_total: checklist.length + tplTotal,
                   checklist_done: checklist.filter((i) => i.done).length + tplDone,
                 });
                return (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${readinessColor(r.level)}`} title={r.missing.join(", ") || "Ready"}>
                    {r.score}% {r.level === "ready" ? "ready" : r.missing[0] ? `· need ${r.missing[0].toLowerCase()}` : ""}
                  </span>
                );
              })()}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {formConflicts.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs flex gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-amber-700">
                    {formConflicts.length} scheduling conflict{formConflicts.length === 1 ? "" : "s"}
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {formConflicts.slice(0, 5).map((c, i) => (
                      <li key={i}>
                        Overlaps <span className="font-medium">{c.other.title}</span> ({c.reason === "both" ? "same room & leader" : `same ${c.reason}`})
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {classSeries.length > 0 && (
              <div className="space-y-2">
                <Label>Class series (optional)</Label>
                <Select value={form.class_series_id || "_none"} onValueChange={(v) => applySeries(v === "_none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="No series" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">No series</SelectItem>
                    {classSeries.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

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
                <Label>{form.category === "Class" ? "Teacher" : "Leader"}</Label>
                <Input
                  value={form.leader_name}
                  onChange={(e) => setForm({ ...form, leader_name: e.target.value })}
                  placeholder={form.category === "Class" ? "Who's teaching?" : ""}
                  disabled={form.leader_not_needed}
                />
                {form.category === "Class" && !form.leader_name && !form.leader_not_needed && (
                  <p className="text-[11px] text-warning">
                    Needed for classes — you can save without it, but it'll be flagged.
                  </p>
                )}
                <label className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                  <Switch
                    checked={form.leader_not_needed}
                    onCheckedChange={(v) => setForm({ ...form, leader_not_needed: v })}
                  />
                  No {form.category === "Class" ? "teacher" : "leader"} needed
                </label>
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                {rooms.length > 0 && (() => {
                  const nonOfficeSelected = form.room_ids.some((id) => {
                    const r = rooms.find((rm) => rm.id === id);
                    return r && r.name.trim().toLowerCase() !== "office";
                  });
                  return (
                    <div className="space-y-2 pt-2">
                      <Label className="text-xs">Rooms</Label>
                      <div className={`flex flex-wrap gap-1.5 ${form.room_not_needed ? "opacity-50 pointer-events-none" : ""}`}>
                        {rooms.map((r) => {
                          const on = form.room_ids.includes(r.id);
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => {
                                if (on) {
                                  setForm({ ...form, room_ids: form.room_ids.filter((x) => x !== r.id) });
                                } else {
                                  setForm({ ...form, room_ids: [...form.room_ids, r.id] });
                                }
                              }}
                              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                                on ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
                              }`}
                            >{r.name}</button>
                          );
                        })}
                      </div>
                      {nonOfficeSelected && (
                        <div className="space-y-1.5 pt-2 pl-1">
                          <label className="flex items-center gap-2 text-xs">
                            <Checkbox
                              checked={roomRequestSubmitted}
                              onCheckedChange={(v) => setRoomRequestSubmitted(v === true)}
                            />
                            Room request submitted
                          </label>
                          <label className="flex items-center gap-2 text-xs">
                            <Checkbox
                              checked={roomApprovalReceived}
                              onCheckedChange={(v) => setRoomApprovalReceived(v === true)}
                            />
                            Approval received
                          </label>
                        </div>
                      )}
                      <label className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                        <Switch
                          checked={form.room_not_needed}
                          onCheckedChange={(v) => setForm({ ...form, room_not_needed: v })}
                        />
                        No room needed (e.g. holiday / FYI)
                      </label>
                    </div>
                  );
                })()}
              </div>
            </div>


            {form.category === "Class" && (
              <div className="space-y-3 rounded-xl border border-border p-3">
                <Label className="text-sm font-medium">Childcare</Label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={form.childcare_needed}
                    onCheckedChange={(v) => setForm({ ...form, childcare_needed: v, childcare_arranged: v ? form.childcare_arranged : false })}
                  />
                  This class needs childcare
                </label>
                {form.childcare_needed && (
                  <>
                    <label className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={form.childcare_arranged}
                        onCheckedChange={(v) => setForm({ ...form, childcare_arranged: v })}
                      />
                      Childcare arranged
                    </label>
                    {!form.childcare_arranged && (
                      <p className="text-[11px] text-warning">
                        We'll keep flagging this event until childcare is marked as arranged.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}




            {/* Logistics */}
            <div className="space-y-3 rounded-xl border border-border p-3">
              <Label className="text-sm font-medium">Logistics</Label>
              <div className="space-y-2">
                <Label className="text-xs">Promote / list on</Label>
                <div className="grid grid-cols-2 gap-2">
                  {LISTING_CHANNELS.map((c) => {
                    const checked = c.key === "pco"
                      ? form.pco_registration
                      : form.other_listings.includes(c.key);
                    const toggle = (v: boolean) => {
                      if (c.key === "pco") {
                        setForm({ ...form, pco_registration: v });
                      } else {
                        const next = v
                          ? Array.from(new Set([...form.other_listings, c.key]))
                          : form.other_listings.filter((k) => k !== c.key);
                        setForm({ ...form, other_listings: next });
                      }
                      if (form.id) syncListingChecklist(form.id, c.key, v);
                    };
                    return (
                      <label key={c.key} className="flex items-center gap-2 text-sm">
                        <Switch checked={checked} onCheckedChange={toggle} />
                        {c.label}
                      </label>
                    );
                  })}
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={form.social_ads}
                      onCheckedChange={(v) => {
                        setForm({ ...form, social_ads: v });
                        if (form.id) syncListingChecklist(form.id, "social_ads", v);
                      }}
                    />
                    Social ads
                  </label>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Comms Channels</Label>
                <div className="grid grid-cols-2 gap-2">
                  {COMMS_CHANNELS.map((c) => {
                    const checked = form.other_listings.includes(c.key);
                    const toggle = (v: boolean) => {
                      const next = v
                        ? Array.from(new Set([...form.other_listings, c.key]))
                        : form.other_listings.filter((k) => k !== c.key);
                      setForm({ ...form, other_listings: next });
                      if (form.id) syncListingChecklist(form.id, c.key, v);
                    };
                    return (
                      <label key={c.key} className="flex items-center gap-2 text-sm">
                        <Switch checked={checked} onCheckedChange={toggle} />
                        {c.label}
                      </label>
                    );
                  })}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.missions_team_needed}
                  onCheckedChange={(v) => setForm({ ...form, missions_team_needed: v })}
                />
                Missions team needed
              </label>
              {form.missions_team_needed && (
                <div className="space-y-2">
                  <Label className="text-xs">Church covering</Label>
                  <Input
                    placeholder="e.g. Family Hope, COAH:LM, Both"
                    value={form.church_covering}
                    onChange={(e) => setForm({ ...form, church_covering: e.target.value })}
                  />
                </div>
              )}
              {form.id && (
                <div className="space-y-2 pt-2 border-t border-border/60">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Ad-hoc checklist</Label>
                    <ReadinessBadge value={deriveReadiness(checklist, form.readiness)} />
                  </div>
                  <div className="space-y-1">
                    {checklist.map((item) => {
                      const assignee = assignableUsers.find((u) => u.id === item.assignee_id);
                      const assigneeLabel = assignee?.full_name || assignee?.email || null;
                      return (
                        <div key={item.id} className="flex items-center gap-2 group rounded-md border border-border/60 px-2 py-1.5">
                          <Checkbox checked={item.done} onCheckedChange={() => toggleChecklistItem(item)} />
                          <div className="flex-1 min-w-0">
                            {editingChecklistId === item.id ? (
                              <Input
                                autoFocus
                                value={editingChecklistLabel}
                                onChange={(e) => setEditingChecklistLabel(e.target.value)}
                                onBlur={async () => {
                                  const next = editingChecklistLabel.trim();
                                  setEditingChecklistId(null);
                                  if (!next || next === item.label) return;
                                  const { error } = await supabase
                                    .from("event_checklist_items")
                                    .update({ label: next })
                                    .eq("id", item.id);
                                  if (error) { toast.error(error.message); return; }
                                  if (item.action_item_id) {
                                    await supabase
                                      .from("action_items")
                                      .update({ title: next })
                                      .eq("id", item.action_item_id);
                                  }
                                  if (form.id) loadChecklist(form.id);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
                                  if (e.key === "Escape") { setEditingChecklistId(null); }
                                }}
                                className="h-7 text-sm"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => { setEditingChecklistId(item.id); setEditingChecklistLabel(item.label); }}
                                className={`block w-full text-left text-sm truncate hover:text-foreground ${item.done ? "line-through text-muted-foreground" : ""}`}
                                title="Click to edit"
                              >
                                {item.label}
                              </button>
                            )}
                            {(assigneeLabel || item.due_date || item.action_item_id) && (
                              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                                {assigneeLabel && <span>👤 {assigneeLabel}</span>}
                                {item.due_date && <span>📅 {item.due_date}</span>}
                                {item.action_item_id && (
                                  <span title="Synced as a task" className="inline-flex items-center gap-0.5">
                                    <CheckCircle2 className="w-3 h-3" /> task
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                                title={item.assignee_id ? "Reassign" : "Assign to user"}
                              >
                                <UserPlus className="w-3.5 h-3.5" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-2 space-y-2" align="end">
                              <div className="text-xs font-medium px-1">Assign task</div>
                              <Select
                                value={item.assignee_id ?? ""}
                                onValueChange={async (uid) => {
                                  try {
                                    await assignFn({ data: { checklistItemId: item.id, assigneeId: uid, dueDate: item.due_date } });
                                    toast.success("Assigned");
                                    loadChecklist(form.id!);
                                  } catch (e: any) { toast.error(e.message ?? "Failed"); }
                                }}
                              >
                                <SelectTrigger className="h-8"><SelectValue placeholder="Pick a user…" /></SelectTrigger>
                                <SelectContent>
                                  {assignableUsers.map((u) => (
                                    <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                type="date"
                                value={item.due_date ?? ""}
                                onChange={async (e) => {
                                  const v = e.target.value || null;
                                  if (!item.assignee_id) {
                                    await supabase.from("event_checklist_items").update({ due_date: v }).eq("id", item.id);
                                    loadChecklist(form.id!);
                                    return;
                                  }
                                  try {
                                    await assignFn({ data: { checklistItemId: item.id, assigneeId: item.assignee_id, dueDate: v } });
                                    loadChecklist(form.id!);
                                  } catch (err: any) { toast.error(err.message ?? "Failed"); }
                                }}
                                className="h-8"
                              />
                              {item.action_item_id && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="w-full justify-start text-muted-foreground"
                                  onClick={async () => {
                                    try {
                                      await unassignFn({ data: { checklistItemId: item.id } });
                                      toast.success("Task removed");
                                      loadChecklist(form.id!);
                                    } catch (e: any) { toast.error(e.message ?? "Failed"); }
                                  }}
                                >
                                  <UserMinus className="w-3.5 h-3.5 mr-1.5" /> Unassign
                                </Button>
                              )}
                              <div className="text-[10px] text-muted-foreground px-1">
                                Task title includes the event name and date so it makes sense in Google Tasks.
                              </div>
                            </PopoverContent>
                          </Popover>
                          <button type="button" onClick={() => deleteChecklistItem(item.id)}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex gap-2">
                    <Input
                      placeholder="Add a one-off item…"
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

            {/* Checklist Templates */}
            {form.id && (
              <div className="space-y-3 rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-medium">Checklist templates</Label>
                  <Link to="/checklists" className="text-xs text-muted-foreground underline">
                    Manage templates
                  </Link>
                </div>

                {allTemplates.length === 0 ? (
                  <div className="text-xs text-muted-foreground">
                    No templates yet. <Link to="/checklists" className="underline">Create one</Link>.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {allTemplates.map((t) => {
                      const on = eventTemplateIds.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleEventTemplate(t.id, on)}
                          className={`text-xs px-2 py-1 rounded-full border ${
                            on ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
                          }`}
                        >
                          {on ? "✓ " : "+ "}{t.name}
                        </button>
                      );
                    })}
                  </div>
                )}

                {eventTemplateIds.length > 0 && (() => {
                  const occDate = currentOccurrenceDate();
                  const dateKey = format(occDate, "yyyy-MM-dd");
                  return (
                    <div className="space-y-3 pt-1">
                      <div className="text-xs text-muted-foreground">
                        State shown for{" "}
                        <span className="font-medium text-foreground">{format(occDate, "MMM d, yyyy")}</span>
                        {form.recurs ? " (this occurrence only)" : ""}
                      </div>
                      {eventTemplateIds.map((tid) => {
                        const tpl = allTemplates.find((t) => t.id === tid);
                        if (!tpl) return null;
                        const its = allTemplateItems.filter((i) => i.template_id === tid);
                        return (
                          <div key={tid} className="space-y-1">
                            <div className="text-xs font-medium">{tpl.name}</div>
                            {its.length === 0 ? (
                              <div className="text-xs text-muted-foreground italic pl-1">(no items)</div>
                            ) : its.map((it) => {
                              const done = !!templateStates[`${it.id}:${dateKey}`];
                              return (
                                <div key={it.id} className="flex items-center gap-2 pl-1">
                                  <Checkbox checked={done} onCheckedChange={() => toggleTemplateItem(it.id, done)} />
                                  <span className={`flex-1 text-sm ${done ? "line-through text-muted-foreground" : ""}`}>
                                    {it.label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}



            {form.id && (
              <EventComments
                eventId={form.id}
                userId={user?.id ?? null}
                assignableUsers={assignableUsers}
                onTaskCreated={() => form.id && loadChecklist(form.id)}
              />
            )}

            <DialogFooter className="flex sm:justify-between gap-2 flex-wrap">
              <div className="flex gap-2">
                {form.id && (
                  <Button type="button" variant="ghost" onClick={remove}>
                    <Trash2 className="w-4 h-4 mr-1.5" /> Delete series
                  </Button>
                )}
                {form.id && form.recurs && editingOccurrence && (
                  <>
                    <Button type="button" variant="ghost" onClick={skipOccurrence}>
                      Skip this date
                    </Button>
                    <Button type="button" variant="secondary" onClick={saveOccurrenceOnly}>
                      Save this occurrence only
                    </Button>
                  </>
                )}
              </div>
              <Button type="submit">
                {form.id ? (form.recurs && editingOccurrence ? "Save entire series" : "Save changes") : "Add event"}
              </Button>
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

function EventChip({ occ, compact, conflictCount, readiness }: {
  occ: Occurrence;
  compact?: boolean;
  conflictCount?: number;
  readiness: ReturnType<typeof scoreEvent>;
}) {
  const cal = SUB_CALS.find((s) => s.value === occ.sub_calendar)!;
  const gaps = classGaps(occ);
  const ringColor = readiness.level === "ready" ? "bg-emerald-500" : readiness.level === "warning" ? "bg-amber-500" : "bg-destructive";
  const titleBits = [
    `${readiness.score}% ready`,
    readiness.missing.length ? `Missing: ${readiness.missing.join(", ")}` : "",
    gaps.length ? `Class needs: ${gaps.join(", ")}` : "",
    conflictCount ? `${conflictCount} conflict${conflictCount === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(" · ");
  return (
    <div
      className={`text-[10px] truncate px-1.5 py-0.5 rounded hover:opacity-80 flex items-center gap-1 ${compact ? "" : ""}`}
      style={{
        background: `color-mix(in oklab, ${cal.color} 22%, transparent)`,
        color: `color-mix(in oklab, ${cal.color} 90%, white)`,
      }}
      title={titleBits || undefined}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${ringColor}`} />
      {conflictCount ? <AlertTriangle className="w-2.5 h-2.5 text-amber-500 shrink-0" /> : null}
      <span className="truncate">
        {!occ.all_day && <>{format(occ.occurrence_date, "h:mm")} </>}
        {occ.title}
      </span>
    </div>
  );
}

function MonthGrid({
  cursor, occurrences, conflictMap, onPickDay, onPickEvent, canEdit, readinessOf,
}: {
  cursor: Date;
  occurrences: Occurrence[];
  conflictMap: Map<string, number>;
  onPickDay: (d: Date) => void;
  onPickEvent: (o: Occurrence) => void;
  canEdit: boolean;
  readinessOf: (occ: Occurrence) => ReturnType<typeof scoreEvent>;
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
                    <EventChip occ={o} conflictCount={conflictMap.get(`${o.id}-${o.occurrence_date.getTime()}`)} readiness={readinessOf(o)} />
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

function ListView({ occurrences, conflictMap, onPickEvent, readinessOf }: { occurrences: Occurrence[]; conflictMap: Map<string, number>; onPickEvent: (o: Occurrence) => void; readinessOf: (occ: Occurrence) => ReturnType<typeof scoreEvent> }) {
  if (occurrences.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-2">
        <EmptyState icon={CalendarDays} title="No events to show" description="Try clearing filters or adding an event." />
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
                {(() => {
                  const r = readinessOf(o);
                  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${readinessColor(r.level)}`} title={r.missing.join(", ") || "Ready"}>{r.score}%</span>;
                })()}
                {conflictMap.get(`${o.id}-${o.occurrence_date.getTime()}`) ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-700 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Conflict
                  </span>
                ) : null}

                {o.pco_registration && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">PCO</span>
                )}
                {(o.other_listings ?? [])
                  .filter((k) => LISTING_LABEL.has(k))
                  .map((k) => (
                    <span key={k} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                      {LISTING_LABEL.get(k)}
                    </span>
                  ))}
                {(o as any).social_ads && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-fuchsia-500/15 text-fuchsia-700">Social ads</span>
                )}
                {o.missions_team_needed && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/20 text-accent-foreground">Missions</span>
                )}
                {classGaps(o).length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/20 text-warning">
                    Needs {classGaps(o).join(" + ")}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {cal.label}
                {o.category && <> · {o.category}</>}
                {o.leader_name && <> · Led by {o.leader_name}</>}
                {o.location && <> · {o.location}</>}
                {o.room_needed && <> · Room: {o.room_needed}</>}
                {o.church_covering && <> · {o.church_covering}</>}
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

type CommentRow = {
  id: string;
  body: string;
  author_id: string;
  created_at: string;
  author_name?: string | null;
};

type MentionUser = { id: string; full_name: string | null; email: string };

function EventComments({
  eventId,
  userId,
  assignableUsers = [],
  onTaskCreated,
}: {
  eventId: string;
  userId: string | null;
  assignableUsers?: UserOption[];
  onTaskCreated?: () => void;
}) {
  const [items, setItems] = useState<CommentRow[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [users, setUsers] = useState<MentionUser[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashStart, setSlashStart] = useState<number | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskAssignee, setTaskAssignee] = useState<string>("");
  const [taskDue, setTaskDue] = useState<string>("");
  const [creatingTask, setCreatingTask] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const notifyMentions = useServerFn(notifyCommentMentions);
  const assignFn = useServerFn(assignChecklistItem);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("event_comments")
      .select("id,body,author_id,created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });
    if (error) { toast.error(error.message); setLoading(false); return; }
    const rows = (data ?? []) as CommentRow[];
    const ids = Array.from(new Set(rows.map((r) => r.author_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      const map = new Map((profs ?? []).map((p: any) => [p.id, p.full_name || p.email]));
      rows.forEach((r) => { r.author_name = map.get(r.author_id) ?? null; });
    }
    setItems(rows);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [eventId]);

  useEffect(() => {
    supabase.from("profiles").select("id, full_name, email").order("full_name").then(({ data }) => {
      setUsers((data ?? []) as MentionUser[]);
    });
  }, []);

  const filteredUsers = useMemo(() => {
    const q = mentionQuery.toLowerCase();
    const list = q
      ? users.filter((u) => (u.full_name ?? "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      : users;
    return list.slice(0, 6);
  }, [users, mentionQuery]);

  const extractMentions = (text: string): string[] => {
    const ids = new Set<string>();
    for (const u of users) {
      const name = u.full_name?.trim();
      if (name && new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)) {
        ids.add(u.id);
      }
    }
    return Array.from(ids);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const pos = e.target.selectionStart ?? val.length;
    setBody(val);
    const before = val.slice(0, pos);
    const m = before.match(/@([\w'’\- ]*)$/);
    if (m) {
      setMentionStart(pos - m[0].length);
      setMentionQuery(m[1]);
      setMentionOpen(true);
      setActiveIdx(0);
    } else {
      setMentionOpen(false);
      setMentionStart(null);
    }
    // Slash command: `/` at start-of-line or after whitespace opens the task picker
    const slash = before.match(/(?:^|\s)\/([^\n/]*)$/);
    if (slash && !m) {
      const startIdx = pos - slash[1].length - 1;
      setSlashStart(startIdx);
      setTaskTitle(slash[1]);
      setSlashOpen(true);
    } else if (slashOpen && !slash) {
      setSlashOpen(false);
      setSlashStart(null);
    }
  };

  const createTaskFromSlash = async () => {
    const title = taskTitle.trim();
    if (!title || !userId || slashStart === null) return;
    setCreatingTask(true);
    try {
      const { data: inserted, error } = await supabase
        .from("event_checklist_items")
        .insert({ event_id: eventId, label: title, position: 999 })
        .select("id")
        .single();
      if (error || !inserted) throw new Error(error?.message ?? "Failed to create task");
      if (taskAssignee) {
        try {
          await assignFn({
            data: {
              checklistItemId: inserted.id,
              assigneeId: taskAssignee,
              dueDate: taskDue || null,
            },
          });
        } catch (e: any) {
          toast.error(e?.message ?? "Task created but assignment failed");
        }
      } else if (taskDue) {
        await supabase
          .from("event_checklist_items")
          .update({ due_date: taskDue })
          .eq("id", inserted.id);
      }
      // Replace `/query` segment with a task marker so the comment references it
      const before = body.slice(0, slashStart);
      const taPos = textareaRef.current?.selectionStart ?? body.length;
      const after = body.slice(taPos);
      const marker = `📋 ${title}`;
      setBody(`${before}${marker}${after}`);
      setSlashOpen(false);
      setSlashStart(null);
      setTaskTitle("");
      setTaskAssignee("");
      setTaskDue("");
      toast.success("Task added to checklist");
      onTaskCreated?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create task");
    } finally {
      setCreatingTask(false);
    }
  };

  const insertMention = (u: MentionUser) => {
    if (mentionStart === null) return;
    const name = u.full_name || u.email;
    const before = body.slice(0, mentionStart);
    const after = body.slice((textareaRef.current?.selectionStart) ?? body.length);
    const next = `${before}@${name} ${after}`;
    setBody(next);
    setMentionOpen(false);
    setMentionStart(null);
    setMentionQuery("");
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        const caret = before.length + name.length + 2;
        ta.focus();
        ta.setSelectionRange(caret, caret);
      }
    });
  };

  const post = async () => {
    const text = body.trim();
    if (!text || !userId) return;
    setPosting(true);
    const { error } = await supabase
      .from("event_comments")
      .insert({ event_id: eventId, author_id: userId, body: text });
    setPosting(false);
    if (error) { toast.error(error.message); return; }
    const mentioned = extractMentions(text).filter((id) => id !== userId);
    if (mentioned.length) {
      notifyMentions({ data: { eventId, commentBody: text, mentionedUserIds: mentioned } })
        .then((r) => { if (r?.sent) toast.success(`Notified ${r.sent} ${r.sent === 1 ? "person" : "people"}`); })
        .catch((e) => console.error("notifyCommentMentions failed", e));
    }
    setBody("");
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("event_comments").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setItems((prev) => prev.filter((c) => c.id !== id));
  };

  const renderBody = (text: string) => {
    const names = users.map((u) => u.full_name).filter(Boolean) as string[];
    if (names.length === 0) return text;
    const re = new RegExp(`@(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "g");
    const parts: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      parts.push(
        <span key={m.index} className="bg-primary/10 text-primary rounded px-1 font-medium">@{m[1]}</span>,
      );
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  };

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <Label className="text-sm font-medium">Comments</Label>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {loading && <div className="text-xs text-muted-foreground">Loading…</div>}
        {!loading && items.length === 0 && (
          <div className="text-xs text-muted-foreground">No comments yet. Start the thread below.</div>
        )}
        {items.map((c) => (
          <div key={c.id} className="group flex items-start gap-2 text-sm">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">{c.author_name ?? "Someone"}</span>
                <span>{format(new Date(c.created_at), "MMM d, h:mm a")}</span>
              </div>
              <div className="whitespace-pre-wrap break-words">{renderBody(c.body)}</div>
            </div>
            {c.author_id === userId && (
              <button
                type="button"
                onClick={() => remove(c.id)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                title="Delete comment"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Textarea
            ref={textareaRef}
            rows={2}
            placeholder={userId ? "Add a comment… @ to mention, / to add a task" : "Sign in to comment"}
            value={body}
            onChange={handleChange}
            onKeyDown={(e) => {
              if (mentionOpen && filteredUsers.length > 0) {
                if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => (i + 1) % filteredUsers.length); return; }
                if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => (i - 1 + filteredUsers.length) % filteredUsers.length); return; }
                if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(filteredUsers[activeIdx]); return; }
                if (e.key === "Escape") { e.preventDefault(); setMentionOpen(false); return; }
              }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault(); post();
              }
            }}
            disabled={!userId || posting}
          />
          {mentionOpen && filteredUsers.length > 0 && (
            <div className="absolute bottom-full left-0 mb-1 w-64 rounded-lg border border-border bg-popover shadow-md z-50 overflow-hidden">
              {filteredUsers.map((u, i) => (
                <button
                  key={u.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); insertMention(u); }}
                  className={`w-full text-left px-3 py-1.5 text-sm flex flex-col ${i === activeIdx ? "bg-accent" : "hover:bg-accent/50"}`}
                >
                  <span className="font-medium">{u.full_name || u.email}</span>
                  {u.full_name && <span className="text-[11px] text-muted-foreground">{u.email}</span>}
                </button>
              ))}
            </div>
          )}
          {slashOpen && (
            <div className="absolute bottom-full left-0 mb-1 w-80 rounded-lg border border-border bg-popover shadow-md z-50 p-3 space-y-2">
              <div className="text-[11px] font-medium text-muted-foreground">New task for this event</div>
              <Input
                autoFocus
                placeholder="Task title"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                className="h-8"
              />
              <div className="grid grid-cols-2 gap-2">
                <Select value={taskAssignee || "_none"} onValueChange={(v) => setTaskAssignee(v === "_none" ? "" : v)}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Assignee" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Unassigned</SelectItem>
                    {assignableUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={taskDue}
                  onChange={(e) => setTaskDue(e.target.value)}
                  className="h-8"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => { setSlashOpen(false); setSlashStart(null); }}>
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={createTaskFromSlash} disabled={creatingTask || !taskTitle.trim()}>
                  {creatingTask ? "Adding…" : "Add task"}
                </Button>
              </div>
            </div>
          )}
        </div>
        <Button type="button" size="sm" onClick={post} disabled={!userId || posting || !body.trim()}>
          Post
        </Button>
      </div>
    </div>
  );
}
