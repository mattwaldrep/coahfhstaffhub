import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { sendGmailMessage } from "@/lib/gmail-send.functions";
import { syncItineraryDoc } from "@/lib/itinerary-doc.functions";
import {
  format, isPast, isThisMonth, isWithinInterval, startOfMonth, endOfMonth,
  addMonths, subMonths, startOfDay, isSameMonth, isSameYear,
} from "date-fns";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash2, ExternalLink, Mail, Phone, Upload, FileText, X as XIcon,
  LayoutGrid, List, Table as TableIcon, CalendarDays, ChevronLeft, ChevronRight,
  ArrowUpDown, Copy, Send, FileUp,
} from "lucide-react";
import { toast } from "sonner";

type ViewMode = "timeline" | "kanban" | "table" | "calendar";
const VIEW_STORAGE_KEY = "missions:view";

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started", tbc: "TBC", pre_trip: "Pre-Trip",
  in_field: "In Field", complete: "Complete", cancelled: "Cancelled",
};
const STATUS_TONE: Record<string, string> = {
  not_started: "oklch(0.7 0.02 270)",
  tbc: "oklch(0.75 0.12 75)",
  pre_trip: "oklch(0.7 0.15 230)",
  in_field: "oklch(0.7 0.18 145)",
  complete: "oklch(0.6 0.06 160)",
  cancelled: "oklch(0.6 0.04 25)",
};

export const Route = createFileRoute("/missions")({
  component: MissionsPage,
});

const STEPS = [
  { key: "confirmation", label: "Confirmation" },
  { key: "welcome_email", label: "Welcome email" },
  { key: "questionnaire_received", label: "Questionnaire received" },
  { key: "planning_call", label: "Planning call" },
  { key: "draft_schedule", label: "Draft schedule" },
  { key: "confirm_schedule", label: "Confirm schedule & staff leads" },
  { key: "place_supplies", label: "Place supplies orders" },
  { key: "send_final_schedule", label: "Send final schedule" },
  { key: "orientation", label: "Orientation session" },
  { key: "daily_check_in", label: "Daily leader check-in" },
  { key: "thank_you", label: "Thank-you & feedback" },
  { key: "debrief", label: "Debrief call" },
];

const COLUMNS = [
  { value: "not_started", label: "Not started" },
  { value: "tbc", label: "TBC" },
  { value: "pre_trip", label: "Pre-Trip" },
  { value: "in_field", label: "In Field" },
  { value: "complete", label: "Complete" },
  { value: "cancelled", label: "Cancelled" },
] as const;

type Status = typeof COLUMNS[number]["value"];

type Trip = {
  id: string;
  church_name: string;
  start_date: string | null;
  end_date: string | null;
  leader_name: string | null;
  leader_phone: string | null;
  leader_email: string | null;
  primary_focus: string | null;
  team_number: string | null;
  status: Status;
  itinerary_link: string | null;
  itinerary_file_path: string | null;
  itinerary_file_name: string | null;
  notes: string | null;
  steps: Record<string, boolean>;
  position: number;
  inquiry_token: string;
  inquiry_submitted_at: string | null;
  planning_call_at: string | null;
  team_headcount: number | null;
  adults_count: number | null;
  students_count: number | null;
  lodging_status: string | null;
  transport_status: string | null;
  daily_window_start: string | null;
  daily_window_end: string | null;
  outreach_tracks: string[];
  comms_preference: string | null;
  itinerary_owner: string | null;
  itinerary_due_date: string | null;
  dietary_flags: string | null;
  planning_notes: Record<string, string>;
  draft_itinerary: string | null;
  coordinator_on_call_name: string | null;
  coordinator_on_call_phone: string | null;
  confirm_checklist: Record<string, boolean>;
  itinerary_doc_id: string | null;
  itinerary_doc_url: string | null;
};

const OUTREACH_TRACK_OPTIONS = [
  { value: "transit", label: "Transit evangelism" },
  { value: "prayer_walk", label: "Prayer walk" },
  { value: "surveys", label: "Surveys" },
  { value: "service_project", label: "Service project" },
];

const PLANNING_NOTE_SECTIONS: { key: string; label: string }[] = [
  { key: "prayer", label: "Prayer" },
  { key: "team_snapshot", label: "Team snapshot (headcount, leaders, lodging/transport)" },
  { key: "goals", label: "Goals & outcomes — what would 'fruitful' look like?" },
  { key: "schedule", label: "Schedule & constraints (dates/hours, arrival/departure)" },
  { key: "outreach", label: "Outreach track discussion" },
  { key: "supplies", label: "Supplies & budget (printing, snacks/water, CharlieCards, contingency)" },
  { key: "next_steps", label: "Next steps — who does what by when" },
];

const CONFIRM_CHECKLIST_ITEMS: { key: string; label: string }[] = [
  { key: "staff_leads_assigned", label: "Primary staff lead named for every itinerary activity" },
  { key: "meeting_points_clear", label: "Meeting points & times are unambiguous" },
  { key: "supplies_updated", label: "Supplies list updated to match the schedule" },
];

const WELCOME_SUBJECT = "Let's Plan Your Trip to City On A Hill";

type EmailDraft = {
  to: string;
  subject: string;
  body: string;
};

function buildWelcomeEmailBody(formUrl: string) {
  return (
    `Hello,\n\n` +
    `Thanks for reaching out about serving with us! We're excited to host your team in Boston! We are genuinely excited whenever a team considers joining us in the work here. As a young church plant in one of the most diverse and spiritually complex cities in America, we view missions teams as running one mile of our marathon alongside us—they are partners in planting seeds of gospel hope. Your presence not only strengthens our hands for practical ministry, but also gives our neighbors a tangible picture of the wider body of Christ praying for and investing in this city. Please take a few moments and complete this form to give us a high level understanding of what kind of trip you're looking to take with us:\n\n` +
    `${formUrl}\n\n` +
    `NEXT STEP (Schedule A Planning Call)\n\n` +
    `• Please pick a 30-min slot here: https://calendar.app.google/LZCEYki3L1maEbKLA\n\n` +
    `Thanks, and talk soon!\n` +
    `Matt Waldrep\n` +
    `Worship & Executive Pastor\n` +
    `coahforesthills.org`
  );
}

function inquiryFormUrl(trip: Trip): string {
  const path = `/inquiry/${trip.inquiry_token}`;
  return typeof window === "undefined" ? path : `${window.location.origin}${path}`;
}

function getWelcomeEmailDraft(trip: Trip): EmailDraft {
  const formUrl = inquiryFormUrl(trip);
  const body = buildWelcomeEmailBody(formUrl);
  const to = trip.leader_email ?? "";
  return { to, subject: WELCOME_SUBJECT, body };
}

function fmtDateLong(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function daysBetween(start: string | null, end: string | null): string[] {
  if (!start || !end) return [];
  const out: string[] = [];
  const s = new Date(start + "T12:00:00");
  const e = new Date(end + "T12:00:00");
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const TRACK_LABEL: Record<string, string> = Object.fromEntries(
  OUTREACH_TRACK_OPTIONS.map((o) => [o.value, o.label]),
);

function buildDraftItinerary(form: Form | Trip): string {
  const church = (form.church_name || "[Insert Partner Church Name]").trim();
  const dateRange = form.start_date && form.end_date
    ? `${fmtDateLong(form.start_date)} – ${fmtDateLong(form.end_date)}`
    : "[Insert Trip Dates]";
  const focus = form.primary_focus?.trim() || "[Insert Main Ministry or Outreach Focus]";
  const teamSize = form.team_headcount
    ? `${form.team_headcount}${form.adults_count || form.students_count ? ` (${form.adults_count ?? 0} adults / ${form.students_count ?? 0} students)` : ""}`
    : "[Insert Range]";
  const tracks = (form.outreach_tracks ?? []).map((t) => TRACK_LABEL[t] ?? t).filter(Boolean);
  const tracksLine = tracks.length ? tracks.join(", ") : "[Insert Ministry Partner or Focus]";
  const windowLine = form.daily_window_start && form.daily_window_end
    ? `Daily window: ${form.daily_window_start}–${form.daily_window_end}`
    : "";

  const days = daysBetween(form.start_date, form.end_date);
  const dayBlocks = (days.length
    ? days.map((iso, i) => {
        const d = new Date(iso + "T12:00:00");
        const label = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
        let theme = "[Theme or Focus for the Day]";
        let lines = ["• [Morning Activity]", "• [Afternoon Activity]", "• [Evening Activity or Debrief]"];
        if (i === days.length - 1) {
          theme = "Worship & Departure";
          lines = ["• [Setup time and worship details]", "• [Departure information]"];
        } else if (i === days.length - 2 && days.length >= 3) {
          theme = "Rest & Sightseeing";
          lines = ["• [Suggested free time / cultural experiences]"];
        }
        return `${label} – ${theme}\n${lines.join("\n")}`;
      })
    : [
        "[Day of Week], [Date] – [Theme or Focus for the Day]\n• [Morning Activity]\n• [Afternoon Activity]\n• [Evening Activity or Debrief]",
        "[Day of Week], [Date] – Rest & Sightseeing\n• [Suggested free time activities or optional cultural experiences]",
        "[Day of Week], [Date] – Worship & Departure\n• [Setup Time and Worship Details]\n• [Departure Information]",
      ]
  ).join("\n\n");

  return [
    `Missions Team Plan`,
    ``,
    `Partner Church: ${church}`,
    `Dates: ${dateRange}`,
    `Location: Boston, Massachusetts`,
    `Host: City on a Hill Forest Hills`,
    `Primary Ministry Focus: ${focus}`,
    ``,
    `PURPOSE`,
    `To partner with City on a Hill Forest Hills in serving the city of Boston through gospel-centered outreach, relational ministry, and practical support. Teams will help strengthen ongoing ministry partnerships, encourage local church planters, and bless our neighbors through intentional service.`,
    ``,
    `TRIP OVERVIEW`,
    `During your time in Boston, your team will:`,
    `• Serve alongside COAH Forest Hills in multiple ministry contexts.`,
    `• Support our partnership with ${tracksLine}.`,
    `• Join in neighborhood outreach at local transit stations.`,
    `• Spend focused time with our church planting resident, Cam Sardano, or another ministry leader.`,
    `• Participate in and support Sunday worship at COAH Forest Hills.`,
    ``,
    `SCHEDULE OVERVIEW`,
    dayBlocks,
    ``,
    `TEAM LOGISTICS`,
    `Team Size: ${teamSize}`,
    `Lodging: T-accessible Airbnb near Forest Hills, Jamaica Plain, or Roslindale${form.lodging_status ? ` — ${form.lodging_status}` : ""}`,
    `Transportation: MBTA (Boston's subway/bus system). We'll provide orientation, maps, and assistance with CharlieCards.${form.transport_status ? ` ${form.transport_status}` : ""}`,
    `Meals: Coordinated by team; dinner plans with COAH FH for select ministry nights`,
    `Airport: Boston Logan International (BOS)`,
    `Free Day Suggestions: Boston Common, Seaport District, Museum of Fine Arts, Freedom Trail`,
    windowLine,
    ``,
    `PRIMARY CONTACTS`,
    `Matt Waldrep — Executive & Worship Pastor`,
    `matt@coahforesthills.org | (617) 435-6456`,
    ``,
    `Cam Sardano — Church Planting Resident`,
    `cam@coahforesthills.org | (781) 635-6834`,
    ``,
    `NEXT STEPS`,
    `Once the team is confirmed:`,
    `• COAH FH will provide a finalized detailed schedule one month before arrival.`,
    `• COAH FH will coordinate local logistics for outreach supplies and event prep.`,
    `• The partner church will handle lodging and travel arrangements.`,
    ``,
    `We're excited to serve alongside you and see how God uses this partnership to advance the gospel in Boston.`,
  ].filter((l) => l !== undefined).join("\n");
}

const ITINERARY_SUBJECT_PREFIX = "Draft Itinerary —";

function getItineraryEmailDraft(trip: Trip, itinerary: string): EmailDraft {
  const to = trip.leader_email ?? "";
  const subject = `${ITINERARY_SUBJECT_PREFIX} ${trip.church_name} Boston Mission Trip`;
  const leader = trip.leader_name?.trim() || "team";
  const body =
    `Hi ${leader},\n\n` +
    `Following up from our planning call — please find below a draft itinerary for your team's trip to Boston. ` +
    `Read through it with your leaders and let me know what to adjust (timing, focus, activities, additions). ` +
    `Once you give us the green light, we'll lock it in and start coordinating logistics on our end.\n\n` +
    `------------------------------------------------------------\n` +
    `${itinerary}\n` +
    `------------------------------------------------------------\n\n` +
    `Reply with any changes or questions. Looking forward to serving alongside you.\n\n` +
    `Matt Waldrep\n` +
    `Worship & Executive Pastor\n` +
    `City on a Hill Forest Hills\n` +
    `coahforesthills.org`;
  return { to, subject, body };
}


type Form = Omit<Trip, "id" | "position" | "inquiry_token" | "inquiry_submitted_at"> & { id?: string };

const emptyForm = (): Form => ({
  church_name: "",
  start_date: null,
  end_date: null,
  leader_name: "",
  leader_phone: "",
  leader_email: "",
  primary_focus: "",
  team_number: "",
  status: "not_started",
  itinerary_link: "",
  itinerary_file_path: null,
  itinerary_file_name: null,
  notes: "",
  steps: Object.fromEntries(STEPS.map((s) => [s.key, false])),
  planning_call_at: null,
  team_headcount: null,
  adults_count: null,
  students_count: null,
  lodging_status: "",
  transport_status: "",
  daily_window_start: null,
  daily_window_end: null,
  outreach_tracks: [],
  comms_preference: "",
  itinerary_owner: "",
  itinerary_due_date: null,
  dietary_flags: "",
  planning_notes: {},
  draft_itinerary: "",
  coordinator_on_call_name: "",
  coordinator_on_call_phone: "",
  confirm_checklist: {},
});

function MissionsPage() {
  return (
    <AppShell>
      <Body />
    </AppShell>
  );
}

function Body() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("core") || hasRole("meeting");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [open, setOpen] = useState(false);
  const [emailDraftTrip, setEmailDraftTrip] = useState<Trip | null>(null);
  const [emailKind, setEmailKind] = useState<"welcome" | "itinerary">("welcome");
  const [itineraryEmailBody, setItineraryEmailBody] = useState<string>("");
  const [sendingGmail, setSendingGmail] = useState(false);
  const sendGmail = useServerFn(sendGmailMessage);
  const [form, setForm] = useState<Form>(emptyForm());
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [uploading, setUploading] = useState(false);
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "timeline";
    const saved = window.localStorage.getItem(VIEW_STORAGE_KEY) as ViewMode | null;
    return saved && ["timeline", "kanban", "table", "calendar"].includes(saved) ? saved : "timeline";
  });
  const [showPast, setShowPast] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => startOfMonth(new Date()));

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("mission_trips")
      .on("postgres_changes", { event: "*", schema: "public", table: "mission_trips" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);


  async function load() {
    const { data } = await supabase
      .from("mission_trips")
      .select("*")
      .order("start_date", { ascending: true, nullsFirst: false });
    setTrips((data ?? []) as Trip[]);
  }

  function openNew() {
    if (!canEdit) return;
    setEditingTrip(null);
    setForm(emptyForm());
    setOpen(true);
  }

  function openEdit(t: Trip) {
    if (!canEdit) return;
    setEditingTrip(t);
    setForm({
      id: t.id,
      church_name: t.church_name,
      start_date: t.start_date,
      end_date: t.end_date,
      leader_name: t.leader_name ?? "",
      leader_phone: t.leader_phone ?? "",
      leader_email: t.leader_email ?? "",
      primary_focus: t.primary_focus ?? "",
      team_number: t.team_number ?? "",
      status: t.status,
      itinerary_link: t.itinerary_link ?? "",
      itinerary_file_path: t.itinerary_file_path ?? null,
      itinerary_file_name: t.itinerary_file_name ?? null,
      notes: t.notes ?? "",
      steps: { ...Object.fromEntries(STEPS.map((s) => [s.key, false])), ...(t.steps ?? {}) },
      planning_call_at: t.planning_call_at,
      team_headcount: t.team_headcount,
      adults_count: t.adults_count,
      students_count: t.students_count,
      lodging_status: t.lodging_status ?? "",
      transport_status: t.transport_status ?? "",
      daily_window_start: t.daily_window_start,
      daily_window_end: t.daily_window_end,
      outreach_tracks: t.outreach_tracks ?? [],
      comms_preference: t.comms_preference ?? "",
      itinerary_owner: t.itinerary_owner ?? "",
      itinerary_due_date: t.itinerary_due_date,
      dietary_flags: t.dietary_flags ?? "",
      planning_notes: t.planning_notes ?? {},
      draft_itinerary: t.draft_itinerary ?? "",
      coordinator_on_call_name: t.coordinator_on_call_name ?? "",
      coordinator_on_call_phone: t.coordinator_on_call_phone ?? "",
      confirm_checklist: t.confirm_checklist ?? {},
    });
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      church_name: form.church_name,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      leader_name: form.leader_name || null,
      leader_phone: form.leader_phone || null,
      leader_email: form.leader_email || null,
      primary_focus: form.primary_focus || null,
      team_number: form.team_number || null,
      status: form.status,
      itinerary_link: form.itinerary_link || null,
      itinerary_file_path: form.itinerary_file_path,
      itinerary_file_name: form.itinerary_file_name,
      notes: form.notes || null,
      steps: form.steps,
      planning_call_at: form.planning_call_at || null,
      team_headcount: form.team_headcount,
      adults_count: form.adults_count,
      students_count: form.students_count,
      lodging_status: form.lodging_status || null,
      transport_status: form.transport_status || null,
      daily_window_start: form.daily_window_start || null,
      daily_window_end: form.daily_window_end || null,
      outreach_tracks: form.outreach_tracks ?? [],
      comms_preference: form.comms_preference || null,
      itinerary_owner: form.itinerary_owner || null,
      itinerary_due_date: form.itinerary_due_date || null,
      dietary_flags: form.dietary_flags || null,
      planning_notes: form.planning_notes ?? {},
      draft_itinerary: form.draft_itinerary || null,
      coordinator_on_call_name: form.coordinator_on_call_name || null,
      coordinator_on_call_phone: form.coordinator_on_call_phone || null,
      confirm_checklist: form.confirm_checklist ?? {},
    };
    const { error } = form.id
      ? await supabase.from("mission_trips").update(payload).eq("id", form.id)
      : await supabase.from("mission_trips").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(form.id ? "Trip updated" : "Trip added");
    setOpen(false);
    load();
  }

  async function remove() {
    if (!form.id) return;
    const { error } = await supabase.from("mission_trips").delete().eq("id", form.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Trip deleted");
    setOpen(false);
    load();
  }

  async function moveTrip(trip: Trip, status: Status) {
    if (!canEdit) return;
    const { error } = await supabase.from("mission_trips").update({ status }).eq("id", trip.id);
    if (error) toast.error(error.message);
  }




  async function uploadItinerary(file: File) {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${form.id ?? "new"}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("mission-trips").upload(path, file, { upsert: true });
      if (error) { toast.error(error.message); return; }
      setForm((f) => ({ ...f, itinerary_file_path: path, itinerary_file_name: file.name }));
      toast.success("Itinerary uploaded");
    } finally {
      setUploading(false);
    }
  }

  async function openItinerary(path: string) {
    const { data, error } = await supabase.storage.from("mission-trips").createSignedUrl(path, 60);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank");
  }

  function clearItinerary() {
    setForm((f) => ({ ...f, itinerary_file_path: null, itinerary_file_name: null }));
  }

  const filteredTrips = useMemo(
    () => statusFilter === "all" ? trips : trips.filter((t) => t.status === statusFilter),
    [trips, statusFilter],
  );
  const emailDraft = emailDraftTrip
    ? (emailKind === "itinerary"
        ? getItineraryEmailDraft(emailDraftTrip, itineraryEmailBody || emailDraftTrip.draft_itinerary || buildDraftItinerary(emailDraftTrip))
        : getWelcomeEmailDraft(emailDraftTrip))
    : null;

  function copyDraftValue(label: string, value: string) {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  }

  function openWelcomeEmail(trip: Trip) {
    setEmailKind("welcome");
    setItineraryEmailBody("");
    setEmailDraftTrip(trip);
  }

  function openItineraryEmail(trip: Trip, itinerary: string) {
    setEmailKind("itinerary");
    setItineraryEmailBody(itinerary);
    setEmailDraftTrip(trip);
  }

  async function handleSendGmail() {
    if (!emailDraft || !emailDraftTrip) return;
    if (!emailDraft.to) {
      toast.error("No recipient email on this trip");
      return;
    }
    setSendingGmail(true);
    try {
      await sendGmail({ data: { to: emailDraft.to, subject: emailDraft.subject, body: emailDraft.body } });
      toast.success(`Email sent to ${emailDraft.to}`);
      const stepKey = emailKind === "itinerary" ? "send_final_schedule" : "welcome_email";
      const nextSteps = { ...emailDraftTrip.steps, [stepKey]: true };
      await supabase.from("mission_trips").update({ steps: nextSteps }).eq("id", emailDraftTrip.id);
      setTrips((prev) => prev.map((t) => t.id === emailDraftTrip.id ? { ...t, steps: nextSteps } : t));
      setEmailDraftTrip(null);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setSendingGmail(false);
    }
  }


  const byStatus = useMemo(() => {
    const m: Record<Status, Trip[]> = {
      not_started: [], tbc: [], pre_trip: [], in_field: [], complete: [], cancelled: [],
    };
    for (const t of filteredTrips) m[t.status]?.push(t);
    return m;
  }, [filteredTrips]);

  const VIEW_OPTS: { value: ViewMode; label: string; Icon: typeof List }[] = [
    { value: "timeline", label: "Timeline", Icon: List },
    { value: "kanban", label: "Kanban", Icon: LayoutGrid },
    { value: "table", label: "Table", Icon: TableIcon },
    { value: "calendar", label: "Calendar", Icon: CalendarDays },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Missions</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Track inbound missions teams across the 12-step readiness pipeline.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-border bg-surface">
            {VIEW_OPTS.map(({ value, label, Icon }) => (
              <button
                key={value}
                onClick={() => setView(value)}
                title={label}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md transition ${
                  view === value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          {canEdit && (
            <Button onClick={openNew} size="sm">
              <Plus className="w-4 h-4 mr-1.5" /> New trip
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <button
          onClick={() => setStatusFilter("all")}
          className={`text-xs px-3 py-1 rounded-full border transition ${statusFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
        >All ({trips.length})</button>
        {COLUMNS.map((c) => {
          const count = trips.filter((t) => t.status === c.value).length;
          const on = statusFilter === c.value;
          return (
            <button
              key={c.value}
              onClick={() => setStatusFilter(c.value)}
              className={`text-xs px-3 py-1 rounded-full border transition ${on ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
            >{c.label} ({count})</button>
          );
        })}
        {(view === "timeline" || view === "table") && (
          <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <Checkbox checked={showPast} onCheckedChange={(v) => setShowPast(!!v)} />
            Show past & cancelled
          </label>
        )}
      </div>

      {view === "kanban" && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {COLUMNS.map((col) => (
            <div key={col.value} className="bg-surface border border-border rounded-2xl p-3 flex flex-col min-h-[20rem]">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {col.label}
                </div>
                <div className="text-xs text-muted-foreground">{byStatus[col.value].length}</div>
              </div>
              <div className="space-y-2 flex-1">
                {byStatus[col.value].map((t) => (
                  <TripCard
                    key={t.id}
                    trip={t}
                    onClick={() => openEdit(t)}
                    onMove={(s) => moveTrip(t, s)}
                    onCompose={() => openWelcomeEmail(t)}
                    canEdit={canEdit}
                  />
                ))}
                {byStatus[col.value].length === 0 && (
                  <div className="text-[11px] text-muted-foreground/50 text-center py-4">—</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "timeline" && (
        <TimelineView trips={filteredTrips} showPast={showPast} onOpen={openEdit} onCompose={openWelcomeEmail} />
      )}

      {view === "table" && (
        <TableView trips={filteredTrips} showPast={showPast} onOpen={openEdit} />
      )}

      {view === "calendar" && (
        <CalendarView
          trips={filteredTrips}
          month={calendarMonth}
          onPrev={() => setCalendarMonth((m) => subMonths(m, 1))}
          onNext={() => setCalendarMonth((m) => addMonths(m, 1))}
          onToday={() => setCalendarMonth(startOfMonth(new Date()))}
          onOpen={openEdit}
        />
      )}



      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit trip" : "New trip"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2 col-span-2">
                <Label>Church name</Label>
                <Input value={form.church_name} onChange={(e) => setForm({ ...form, church_name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Start date</Label>
                <Input type="date" value={form.start_date ?? ""} onChange={(e) => setForm({ ...form, start_date: e.target.value || null })} />
              </div>
              <div className="space-y-2">
                <Label>End date</Label>
                <Input type="date" value={form.end_date ?? ""} onChange={(e) => setForm({ ...form, end_date: e.target.value || null })} />
              </div>
              <div className="space-y-2">
                <Label>Leader</Label>
                <Input value={form.leader_name ?? ""} onChange={(e) => setForm({ ...form, leader_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COLUMNS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Leader phone</Label>
                <Input value={form.leader_phone ?? ""} onChange={(e) => setForm({ ...form, leader_phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Leader email</Label>
                <Input type="email" value={form.leader_email ?? ""} onChange={(e) => setForm({ ...form, leader_email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Primary focus</Label>
                <Input value={form.primary_focus ?? ""} onChange={(e) => setForm({ ...form, primary_focus: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Team #</Label>
                <Input value={form.team_number ?? ""} onChange={(e) => setForm({ ...form, team_number: e.target.value })} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Itinerary link</Label>
                <Input value={form.itinerary_link ?? ""} onChange={(e) => setForm({ ...form, itinerary_link: e.target.value })} placeholder="https://…" />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Itinerary file</Label>
                {form.itinerary_file_path ? (
                  <div className="flex items-center gap-2 text-sm bg-background/60 border border-border rounded-lg px-3 py-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <button type="button" onClick={() => openItinerary(form.itinerary_file_path!)} className="flex-1 text-left truncate hover:underline">
                      {form.itinerary_file_name ?? "View file"}
                    </button>
                    <button type="button" onClick={clearItinerary} className="text-muted-foreground hover:text-foreground">
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 text-sm text-muted-foreground border border-dashed border-border rounded-lg px-3 py-3 cursor-pointer hover:bg-background/40">
                    <Upload className="w-4 h-4" />
                    {uploading ? "Uploading…" : "Upload PDF or document"}
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadItinerary(f); }}
                    />
                  </label>
                )}
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Notes</Label>
                <Textarea rows={3} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>

            {editingTrip && (
              <InquiryPanel trip={editingTrip} onCompose={() => openWelcomeEmail(editingTrip)} />
            )}

            <PlanningCallPanel form={form} setForm={setForm} />

            <DraftItineraryPanel
              form={form}
              setForm={setForm}
              canEmail={!!editingTrip && !!form.leader_email}
              onEmail={() => {
                if (!editingTrip) return;
                openItineraryEmail(editingTrip, form.draft_itinerary || buildDraftItinerary(form));
              }}
            />

            <PreTripConfirmPanel form={form} setForm={setForm} />






            <div className="rounded-xl border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Readiness checklist</Label>
                <ProgressBadge steps={form.steps} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {STEPS.map((s) => (
                  <label key={s.key} className="flex items-center gap-2 text-sm py-1">
                    <Checkbox
                      checked={!!form.steps[s.key]}
                      onCheckedChange={(v) => setForm({ ...form, steps: { ...form.steps, [s.key]: !!v } })}
                    />
                    <span className={form.steps[s.key] ? "line-through text-muted-foreground" : ""}>{s.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <DialogFooter className="flex sm:justify-between gap-2 flex-wrap">
              {form.id ? (
                <Button type="button" variant="ghost" onClick={remove}>
                  <Trash2 className="w-4 h-4 mr-1.5" /> Delete
                </Button>
              ) : <span />}
              <Button type="submit">{form.id ? "Save changes" : "Add trip"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!emailDraftTrip} onOpenChange={(next) => { if (!next) setEmailDraftTrip(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{emailKind === "itinerary" ? "Send draft itinerary" : "Welcome email draft"}</DialogTitle>
          </DialogHeader>
          {emailDraft && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>To</Label>
                <div className="flex gap-2">
                  <Input readOnly value={emailDraft.to} />
                  <Button type="button" variant="outline" onClick={() => copyDraftValue("Recipient", emailDraft.to)}>
                    Copy
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Subject</Label>
                <div className="flex gap-2">
                  <Input readOnly value={emailDraft.subject} />
                  <Button type="button" variant="outline" onClick={() => copyDraftValue("Subject", emailDraft.subject)}>
                    Copy
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Body</Label>
                <Textarea readOnly rows={14} value={emailDraft.body} />
              </div>
              <DialogFooter className="flex sm:justify-between gap-2 flex-wrap">
                <div className="flex gap-2 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => copyDraftValue("Email body", emailDraft.body)}
                  >
                    Copy body
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => copyDraftValue("Full email", `To: ${emailDraft.to}\nSubject: ${emailDraft.subject}\n\n${emailDraft.body}`)}
                  >
                    Copy everything
                  </Button>
                </div>
                <Button
                  type="button"
                  onClick={handleSendGmail}
                  disabled={sendingGmail || !emailDraft.to}
                >
                  <Send className="w-4 h-4 mr-1.5" />
                  {sendingGmail ? "Sending…" : "Send via Gmail"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProgressBadge({ steps }: { steps: Record<string, boolean> }) {
  const done = STEPS.filter((s) => steps[s.key]).length;
  const pct = Math.round((done / STEPS.length) * 100);
  const color = pct === 100 ? "oklch(0.7 0.18 145)" : pct >= 50 ? "oklch(0.82 0.16 90)" : "oklch(0.65 0.22 25)";
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full"
      style={{ background: `color-mix(in oklab, ${color} 22%, transparent)`, color }}>
      {done}/{STEPS.length}
    </span>
  );
}

function TripCard({
  trip, onClick, onMove, onCompose, canEdit,
}: {
  trip: Trip;
  onClick: () => void;
  onMove: (s: Status) => void;
  onCompose: () => void;
  canEdit: boolean;
}) {
  const done = STEPS.filter((s) => trip.steps?.[s.key]).length;
  const pct = (done / STEPS.length) * 100;
  return (
    <div className="bg-background/60 border border-border rounded-xl p-3 hover:border-border/80 transition cursor-pointer group"
      onClick={onClick}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="font-medium text-sm leading-tight">{trip.church_name}</div>
        <ProgressBadge steps={trip.steps ?? {}} />
      </div>
      {trip.start_date && (
        <div className="text-[11px] text-muted-foreground">
          {format(new Date(trip.start_date), "MMM d")}
          {trip.end_date && <> – {format(new Date(trip.end_date), "MMM d, yyyy")}</>}
        </div>
      )}
      {trip.leader_name && (
        <div className="text-[11px] text-muted-foreground mt-0.5">{trip.leader_name}</div>
      )}
      {trip.primary_focus && (
        <div className="text-[10px] text-muted-foreground/80 mt-1 line-clamp-2">{trip.primary_focus}</div>
      )}
      <div className="mt-2 h-1 rounded-full bg-border overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-1.5 mt-2 text-muted-foreground">
        {trip.leader_email && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCompose(); }}
            title={`Email ${trip.leader_email} – welcome template`}
            className="hover:text-foreground"
          ><Mail className="w-3 h-3" /></button>
        )}
        {trip.leader_phone && (
          <a href={`tel:${trip.leader_phone}`} onClick={(e) => e.stopPropagation()} title={trip.leader_phone}
            className="hover:text-foreground"><Phone className="w-3 h-3" /></a>
        )}
        {trip.itinerary_link && (
          <a href={trip.itinerary_link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
            className="hover:text-foreground"><ExternalLink className="w-3 h-3" /></a>
        )}
        {canEdit && (
          <select
            value={trip.status}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onMove(e.target.value as Status)}
            aria-label="Move trip to status"
            className="ml-auto text-[10px] bg-transparent border border-border rounded px-1 py-0.5 text-muted-foreground hover:text-foreground"
          >
            {COLUMNS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  const color = STATUS_TONE[status] ?? "oklch(0.7 0.02 270)";
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: `color-mix(in oklab, ${color} 22%, transparent)`, color }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function tripDateLabel(t: Trip) {
  if (!t.start_date) return "No date set";
  const s = new Date(t.start_date);
  if (t.end_date) {
    const e = new Date(t.end_date);
    if (isSameMonth(s, e)) return `${format(s, "MMM d")}–${format(e, "d, yyyy")}`;
    if (isSameYear(s, e)) return `${format(s, "MMM d")} – ${format(e, "MMM d, yyyy")}`;
    return `${format(s, "MMM d, yyyy")} – ${format(e, "MMM d, yyyy")}`;
  }
  return format(s, "MMM d, yyyy");
}

function readinessPct(steps: Record<string, boolean> | null | undefined) {
  const done = STEPS.filter((s) => steps?.[s.key]).length;
  return Math.round((done / STEPS.length) * 100);
}

type GroupKey = "in_field" | "this_month" | "next_month" | "later_year" | "next_year" | "no_date" | "past";
const GROUP_ORDER: { key: GroupKey; label: string }[] = [
  { key: "in_field", label: "In field now" },
  { key: "this_month", label: "This month" },
  { key: "next_month", label: "Next month" },
  { key: "later_year", label: "Later this year" },
  { key: "next_year", label: "Next year and beyond" },
  { key: "no_date", label: "No date set" },
  { key: "past", label: "Past & cancelled" },
];

function bucketTrip(t: Trip): GroupKey {
  if (t.status === "complete" || t.status === "cancelled") return "past";
  if (!t.start_date) return "no_date";
  const today = startOfDay(new Date());
  const start = new Date(t.start_date);
  const end = t.end_date ? new Date(t.end_date) : start;
  if (isWithinInterval(today, { start, end })) return "in_field";
  if (isPast(end)) return "past";
  if (isThisMonth(start)) return "this_month";
  const nextMonthStart = startOfMonth(addMonths(new Date(), 1));
  const nextMonthEnd = endOfMonth(nextMonthStart);
  if (isWithinInterval(start, { start: nextMonthStart, end: nextMonthEnd })) return "next_month";
  if (start.getFullYear() === today.getFullYear()) return "later_year";
  return "next_year";
}

function TimelineView({
  trips, showPast, onOpen, onCompose,
}: { trips: Trip[]; showPast: boolean; onOpen: (t: Trip) => void; onCompose: (t: Trip) => void }) {
  const groups = useMemo(() => {
    const m = new Map<GroupKey, Trip[]>();
    for (const t of trips) {
      const k = bucketTrip(t);
      if (k === "past" && !showPast) continue;
      const arr = m.get(k) ?? [];
      arr.push(t);
      m.set(k, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        if (!a.start_date) return 1;
        if (!b.start_date) return -1;
        return a.start_date.localeCompare(b.start_date);
      });
    }
    return m;
  }, [trips, showPast]);

  const visible = GROUP_ORDER.filter((g) => (groups.get(g.key)?.length ?? 0) > 0);

  if (visible.length === 0) {
    return <EmptyState label="No upcoming trips." />;
  }

  return (
    <div className="space-y-6">
      {visible.map((g) => (
        <section key={g.key}>
          <div className="flex items-baseline gap-2 mb-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {g.label}
            </h2>
            <span className="text-xs text-muted-foreground/70">({groups.get(g.key)!.length})</span>
          </div>
          <div className="space-y-2">
            {groups.get(g.key)!.map((t) => (
              <TimelineRow key={t.id} trip={t} onClick={() => onOpen(t)} onCompose={() => onCompose(t)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TimelineRow({ trip, onClick, onCompose }: { trip: Trip; onClick: () => void; onCompose: () => void }) {
  const pct = readinessPct(trip.steps);
  return (
    <div
      onClick={onClick}
      className="bg-surface border border-border rounded-xl p-3 hover:border-border/80 transition cursor-pointer flex flex-wrap items-center gap-x-4 gap-y-2"
    >
      <div className="min-w-[8rem] text-xs text-muted-foreground">
        {tripDateLabel(trip)}
      </div>
      <div className="flex-1 min-w-[10rem]">
        <div className="font-medium text-sm">{trip.church_name}</div>
        {(trip.leader_name || trip.primary_focus) && (
          <div className="text-[11px] text-muted-foreground truncate">
            {[trip.leader_name, trip.primary_focus].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
      <StatusPill status={trip.status} />
      <div className="flex items-center gap-2 min-w-[6rem]">
        <div className="flex-1 h-1 rounded-full bg-border overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[10px] text-muted-foreground w-8 text-right">{pct}%</span>
      </div>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {trip.leader_email && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onCompose(); }} className="hover:text-foreground" title="Email welcome template">
            <Mail className="w-3.5 h-3.5" />
          </button>
        )}
        {trip.leader_phone && (
          <a href={`tel:${trip.leader_phone}`} onClick={(e) => e.stopPropagation()} className="hover:text-foreground">
            <Phone className="w-3.5 h-3.5" />
          </a>
        )}
        {trip.itinerary_link && (
          <a href={trip.itinerary_link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="hover:text-foreground">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

type SortKey = "church_name" | "start_date" | "end_date" | "leader_name" | "status" | "readiness";

function TableView({
  trips, showPast, onOpen,
}: { trips: Trip[]; showPast: boolean; onOpen: (t: Trip) => void }) {
  const [sortKey, setSortKey] = useState<SortKey>("start_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const rows = useMemo(() => {
    const filtered = trips.filter((t) =>
      showPast ? true : t.status !== "complete" && t.status !== "cancelled",
    );
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = sortVal(a, sortKey);
      const bv = sortVal(b, sortKey);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [trips, sortKey, sortDir, showPast]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  }

  if (rows.length === 0) return <EmptyState label="No trips to show." />;

  return (
    <div className="border border-border rounded-2xl overflow-hidden bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground uppercase tracking-wider bg-background/40">
            <tr>
              <Th label="Church" k="church_name" sortKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <Th label="Start" k="start_date" sortKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <Th label="End" k="end_date" sortKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <Th label="Leader" k="leader_name" sortKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <th className="text-left font-medium px-3 py-2">Focus</th>
              <Th label="Status" k="status" sortKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <Th label="Readiness" k="readiness" sortKey={sortKey} dir={sortDir} onClick={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr
                key={t.id}
                onClick={() => onOpen(t)}
                className="border-t border-border cursor-pointer hover:bg-background/40 transition"
              >
                <td className="px-3 py-2 font-medium">{t.church_name}</td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {t.start_date ? format(new Date(t.start_date), "MMM d, yyyy") : "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {t.end_date ? format(new Date(t.end_date), "MMM d, yyyy") : "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{t.leader_name ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground max-w-[16rem] truncate">{t.primary_focus ?? "—"}</td>
                <td className="px-3 py-2"><StatusPill status={t.status} /></td>
                <td className="px-3 py-2 min-w-[8rem]">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 rounded-full bg-border overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${readinessPct(t.steps)}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-8 text-right">{readinessPct(t.steps)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function sortVal(t: Trip, k: SortKey): string | number | null {
  switch (k) {
    case "church_name": return t.church_name.toLowerCase();
    case "start_date": return t.start_date ?? null;
    case "end_date": return t.end_date ?? null;
    case "leader_name": return (t.leader_name ?? "").toLowerCase();
    case "status": return t.status;
    case "readiness": return readinessPct(t.steps);
  }
}

function Th({
  label, k, sortKey, dir, onClick,
}: { label: string; k: SortKey; sortKey: SortKey; dir: "asc" | "desc"; onClick: (k: SortKey) => void }) {
  const active = sortKey === k;
  return (
    <th
      onClick={() => onClick(k)}
      className="text-left font-medium px-3 py-2 cursor-pointer select-none hover:text-foreground"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${active ? "text-foreground" : "opacity-40"}`} />
        {active && <span className="text-[10px]">{dir === "asc" ? "↑" : "↓"}</span>}
      </span>
    </th>
  );
}

function CalendarView({
  trips, month, onPrev, onNext, onToday, onOpen,
}: {
  trips: Trip[];
  month: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onOpen: (t: Trip) => void;
}) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  // Build a 6-row grid starting Sunday
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }

  const tripsInRange = trips.filter((t) => {
    if (!t.start_date) return false;
    const s = new Date(t.start_date);
    const e = t.end_date ? new Date(t.end_date) : s;
    return e >= days[0] && s <= days[days.length - 1];
  });

  const unscheduled = trips.filter((t) => !t.start_date);
  const today = startOfDay(new Date());

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_16rem] gap-4">
      <div className="bg-surface border border-border rounded-2xl p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="font-display text-lg font-semibold">{format(month, "MMMM yyyy")}</div>
          <div className="flex items-center gap-1">
            <button onClick={onToday} className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground">Today</button>
            <button onClick={onPrev} className="p-1 rounded hover:bg-background/40 text-muted-foreground hover:text-foreground"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={onNext} className="p-1 rounded hover:bg-background/40 text-muted-foreground hover:text-foreground"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="px-1 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
          {days.map((d, i) => {
            const inMonth = isSameMonth(d, month);
            const isToday = startOfDay(d).getTime() === today.getTime();
            const dayTrips = tripsInRange.filter((t) => {
              const s = startOfDay(new Date(t.start_date!));
              const e = startOfDay(new Date(t.end_date ?? t.start_date!));
              const dd = startOfDay(d);
              return dd >= s && dd <= e;
            });
            return (
              <div
                key={i}
                className={`bg-surface min-h-[5.5rem] p-1 text-[10px] ${inMonth ? "" : "opacity-40"}`}
              >
                <div className={`text-right ${isToday ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                  {format(d, "d")}
                </div>
                <div className="space-y-0.5 mt-0.5">
                  {dayTrips.slice(0, 3).map((t) => {
                    const s = startOfDay(new Date(t.start_date!));
                    const isStart = startOfDay(d).getTime() === s.getTime();
                    const color = STATUS_TONE[t.status];
                    return (
                      <button
                        key={t.id}
                        onClick={(e) => { e.stopPropagation(); onOpen(t); }}
                        className="block w-full text-left truncate px-1 py-0.5 rounded text-[10px] hover:brightness-110"
                        style={{ background: `color-mix(in oklab, ${color} 25%, transparent)`, color }}
                        title={t.church_name}
                      >
                        {isStart ? t.church_name : "…"}
                      </button>
                    );
                  })}
                  {dayTrips.length > 3 && (
                    <div className="text-[9px] text-muted-foreground">+{dayTrips.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Unscheduled
        </div>
        {unscheduled.length === 0 ? (
          <div className="text-[11px] text-muted-foreground/60">No unscheduled trips.</div>
        ) : (
          <div className="space-y-1.5">
            {unscheduled.map((t) => (
              <button
                key={t.id}
                onClick={() => onOpen(t)}
                className="w-full text-left bg-background/60 border border-border rounded-lg px-2 py-1.5 hover:border-border/80"
              >
                <div className="text-sm font-medium truncate">{t.church_name}</div>
                <div className="mt-0.5"><StatusPill status={t.status} /></div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="border border-dashed border-border rounded-2xl py-12 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}


function InquiryPanel({ trip, onCompose }: { trip: Trip; onCompose: () => void }) {
  const formUrl = inquiryFormUrl(trip);
  const submitted = !!trip.inquiry_submitted_at;
  const anyResponses = !!((trip as any).vision || (trip as any).church_context || (trip as any).alternate_dates);
  return (
    <div className="rounded-xl border border-border p-3 space-y-3 bg-background/40">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-medium">Planning questionnaire</Label>
        {submitted ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary">
            Submitted {format(new Date(trip.inquiry_submitted_at!), "MMM d, yyyy")}
          </span>
        ) : (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            Awaiting response
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-sm bg-background/60 border border-border rounded-lg px-3 py-2">
        <input readOnly value={formUrl} className="flex-1 bg-transparent outline-none text-xs text-muted-foreground" />
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(formUrl);
            toast.success("Link copied");
          }}
          className="text-muted-foreground hover:text-foreground"
          title="Copy link"
        >
          <Copy className="w-4 h-4" />
        </button>
        <a
          href={formUrl}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground"
          title="Open form"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
      <button
        type="button"
        onClick={onCompose}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-background/60 transition"
      >
        <Send className="w-3.5 h-3.5" />
        Compose welcome email
      </button>
      {anyResponses && (
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Team responses</div>
          {(trip as any).alternate_dates && (
            <ResponseField label="Alternate dates" value={(trip as any).alternate_dates} />
          )}
          {(trip as any).vision && (
            <ResponseField label="Vision & hope" value={(trip as any).vision} />
          )}
          {(trip as any).church_context && (
            <ResponseField label="About the church" value={(trip as any).church_context} />
          )}
        </div>
      )}
    </div>
  );
}

function ResponseField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="text-sm whitespace-pre-wrap">{value}</div>
    </div>
  );
}

function PlanningCallPanel({
  form,
  setForm,
}: {
  form: Form;
  setForm: React.Dispatch<React.SetStateAction<Form>>;
}) {
  function toIntOrNull(v: string): number | null {
    if (v === "") return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  function toggleTrack(value: string, checked: boolean) {
    setForm((f) => {
      const set = new Set(f.outreach_tracks ?? []);
      if (checked) set.add(value); else set.delete(value);
      return { ...f, outreach_tracks: Array.from(set) };
    });
  }
  function setNote(key: string, value: string) {
    setForm((f) => ({ ...f, planning_notes: { ...(f.planning_notes ?? {}), [key]: value } }));
  }

  // Planning call date input wants "YYYY-MM-DDTHH:mm"
  const planningCallLocal = form.planning_call_at
    ? form.planning_call_at.slice(0, 16)
    : "";

  return (
    <div className="rounded-xl border border-border p-3 space-y-4 bg-background/40">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Planning call</Label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2 col-span-2 sm:col-span-1">
          <Label className="text-xs">Call date & time</Label>
          <Input
            type="datetime-local"
            value={planningCallLocal}
            onChange={(e) =>
              setForm({
                ...form,
                planning_call_at: e.target.value ? new Date(e.target.value).toISOString() : null,
              })
            }
          />
        </div>
        <div className="space-y-2 col-span-2 sm:col-span-1">
          <Label className="text-xs">Comms preference</Label>
          <Select
            value={form.comms_preference || "unset"}
            onValueChange={(v) => setForm({ ...form, comms_preference: v === "unset" ? "" : v })}
          >
            <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unset">Not set</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Total headcount</Label>
          <Input
            type="number" min={0}
            value={form.team_headcount ?? ""}
            onChange={(e) => setForm({ ...form, team_headcount: toIntOrNull(e.target.value) })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label className="text-xs">Adults</Label>
            <Input
              type="number" min={0}
              value={form.adults_count ?? ""}
              onChange={(e) => setForm({ ...form, adults_count: toIntOrNull(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Students</Label>
            <Input
              type="number" min={0}
              value={form.students_count ?? ""}
              onChange={(e) => setForm({ ...form, students_count: toIntOrNull(e.target.value) })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Lodging status</Label>
          <Input
            value={form.lodging_status ?? ""}
            placeholder="e.g. AirBnB booked"
            onChange={(e) => setForm({ ...form, lodging_status: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Transport status</Label>
          <Input
            value={form.transport_status ?? ""}
            placeholder="e.g. Rental van, T passes"
            onChange={(e) => setForm({ ...form, transport_status: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Daily start</Label>
          <Input
            type="time"
            value={form.daily_window_start ?? ""}
            onChange={(e) => setForm({ ...form, daily_window_start: e.target.value || null })}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Daily end</Label>
          <Input
            type="time"
            value={form.daily_window_end ?? ""}
            onChange={(e) => setForm({ ...form, daily_window_end: e.target.value || null })}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Itinerary owner</Label>
          <Input
            value={form.itinerary_owner ?? ""}
            placeholder="Who drafts the itinerary?"
            onChange={(e) => setForm({ ...form, itinerary_owner: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Itinerary due</Label>
          <Input
            type="date"
            value={form.itinerary_due_date ?? ""}
            onChange={(e) => setForm({ ...form, itinerary_due_date: e.target.value || null })}
          />
        </div>

        <div className="space-y-2 col-span-2">
          <Label className="text-xs">Dietary / allergy flags</Label>
          <Textarea
            rows={2}
            value={form.dietary_flags ?? ""}
            placeholder="Vegetarian x2, nut allergy, gluten-free…"
            onChange={(e) => setForm({ ...form, dietary_flags: e.target.value })}
          />
        </div>

        <div className="space-y-2 col-span-2">
          <Label className="text-xs">Outreach tracks</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {OUTREACH_TRACK_OPTIONS.map((o) => {
              const checked = (form.outreach_tracks ?? []).includes(o.value);
              return (
                <label key={o.value} className="flex items-center gap-2 text-sm py-1">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => toggleTrack(o.value, !!v)}
                  />
                  <span>{o.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-3 pt-2 border-t border-border">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Agenda notes
        </div>
        {PLANNING_NOTE_SECTIONS.map((s) => (
          <div key={s.key} className="space-y-1.5">
            <Label className="text-xs">{s.label}</Label>
            <Textarea
              rows={2}
              value={form.planning_notes?.[s.key] ?? ""}
              onChange={(e) => setNote(s.key, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function DraftItineraryPanel({
  form,
  setForm,
  canEmail,
  onEmail,
}: {
  form: Form;
  setForm: React.Dispatch<React.SetStateAction<Form>>;
  canEmail: boolean;
  onEmail: () => void;
}) {
  function generate(overwrite: boolean) {
    if (!overwrite && form.draft_itinerary) {
      const ok = window.confirm("Replace the current draft itinerary with a fresh one generated from trip details?");
      if (!ok) return;
    }
    setForm((f) => ({ ...f, draft_itinerary: buildDraftItinerary(f) }));
    toast.success("Draft itinerary generated");
  }

  function copyAll() {
    navigator.clipboard.writeText(form.draft_itinerary ?? "");
    toast.success("Itinerary copied");
  }

  return (
    <div className="rounded-xl border border-border p-3 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Label className="text-sm font-medium">Draft itinerary</Label>
        <div className="flex gap-2 flex-wrap">
          <Button type="button" size="sm" variant="outline" onClick={() => generate(!form.draft_itinerary)}>
            {form.draft_itinerary ? "Regenerate" : "Generate from template"}
          </Button>
          {form.draft_itinerary && (
            <Button type="button" size="sm" variant="outline" onClick={copyAll}>
              Copy
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={onEmail}
            disabled={!canEmail || !form.draft_itinerary}
            title={!canEmail ? "Save trip with a leader email first" : ""}
          >
            <Send className="w-4 h-4 mr-1.5" /> Email to team
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Auto-fills from trip dates, focus, headcount, and outreach tracks. Edit freely before sending — the email body will use exactly what's here.
      </p>
      <Textarea
        rows={18}
        className="font-mono text-xs"
        placeholder="Click 'Generate from template' to start, then edit as needed."
        value={form.draft_itinerary ?? ""}
        onChange={(e) => setForm({ ...form, draft_itinerary: e.target.value })}
      />
    </div>
  );
}

function PreTripConfirmPanel({
  form,
  setForm,
}: {
  form: Form;
  setForm: React.Dispatch<React.SetStateAction<Form>>;
}) {
  const checklist = form.confirm_checklist ?? {};
  const hasCoordinator = !!(form.coordinator_on_call_name?.trim() && form.coordinator_on_call_phone?.trim());
  const itemsDone = CONFIRM_CHECKLIST_ITEMS.filter((i) => checklist[i.key]).length + (hasCoordinator ? 1 : 0);
  const total = CONFIRM_CHECKLIST_ITEMS.length + 1;

  function toggle(key: string, v: boolean) {
    setForm((f) => ({ ...f, confirm_checklist: { ...(f.confirm_checklist ?? {}), [key]: v } }));
  }

  return (
    <div className="rounded-xl border border-border p-3 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Label className="text-sm font-medium">Pre-trip confirmation</Label>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-background/60 border border-border text-muted-foreground">
          {itemsDone}/{total} ready
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Final sign-offs before the team arrives. Use this once the itinerary is locked.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Missions coordinator on-call — name</Label>
          <Input
            value={form.coordinator_on_call_name ?? ""}
            onChange={(e) => setForm({ ...form, coordinator_on_call_name: e.target.value })}
            placeholder="e.g. Matt Waldrep"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Missions coordinator on-call — phone</Label>
          <Input
            value={form.coordinator_on_call_phone ?? ""}
            onChange={(e) => setForm({ ...form, coordinator_on_call_phone: e.target.value })}
            placeholder="(617) 555-1234"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        {CONFIRM_CHECKLIST_ITEMS.map((item) => (
          <label key={item.key} className="flex items-start gap-2 text-sm py-1">
            <Checkbox
              checked={!!checklist[item.key]}
              onCheckedChange={(v) => toggle(item.key, !!v)}
            />
            <span className={checklist[item.key] ? "line-through text-muted-foreground" : ""}>
              {item.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}


