import { useEffect, useMemo, useState, type ReactNode } from "react";
import { format, subDays, addDays, startOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown,
  ExternalLink,
  Upload,
  Download,
  FileText,
  Trash2,
  Send,
  Loader2,
  CalendarIcon,
  X,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { pushActionItemToGoogleTasks, pushActionItemsBulk } from "@/server/google-tasks.functions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { expandEvents, type EventRowLike } from "@/lib/calendar-expand";
import { parseMetricsPdf, type ParsedMetrics } from "@/lib/parse-metrics-pdf";
import { cn } from "@/lib/utils";

/* ---------- shared collapsible card ---------- */

export function StandingSection({
  title,
  subtitle,
  defaultOpen = true,
  badge,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <section className="bg-surface border border-border rounded-2xl overflow-hidden">
        <CollapsibleTrigger className="w-full flex items-center justify-between gap-3 px-6 py-4 hover:bg-muted/30 transition-colors text-left">
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-base flex items-center gap-2">
              {title}
              {badge}
            </h3>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
          <ChevronDown
            className={cn(
              "w-4 h-4 text-muted-foreground transition-transform shrink-0",
              open && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-6 pb-6 pt-1">{children}</div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

/* ---------- per-section notes hook ---------- */

function useSectionNotes(meetingId: string, sectionKey: string) {
  const [notes, setNotes] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("meeting_section_notes")
        .select("notes")
        .eq("meeting_id", meetingId)
        .eq("section_key", sectionKey)
        .maybeSingle();
      if (!mounted) return;
      setNotes((data?.notes as string) ?? "");
      setLoaded(true);
    })();
    return () => {
      mounted = false;
    };
  }, [meetingId, sectionKey]);

  useEffect(() => {
    if (!loaded) return;
    setSaving(true);
    const t = setTimeout(async () => {
      await supabase
        .from("meeting_section_notes")
        .upsert(
          { meeting_id: meetingId, section_key: sectionKey, notes },
          { onConflict: "meeting_id,section_key" },
        );
      setSaving(false);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  return { notes, setNotes, saving, loaded };
}

export function NotesField({
  meetingId,
  sectionKey,
  placeholder = "Notes…",
  rows = 3,
}: {
  meetingId: string;
  sectionKey: string;
  placeholder?: string;
  rows?: number;
}) {
  const { notes, setNotes, saving } = useSectionNotes(meetingId, sectionKey);
  return (
    <div className="space-y-1">
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="resize-y"
      />
      {saving && (
        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Saving…
        </div>
      )}
    </div>
  );
}

/* ---------- 1. & 2. Notes-only sections (Devotional, Lead Like Jesus) ---------- */

export function DevotionalSection({ meetingId }: { meetingId: string }) {
  return (
    <StandingSection
      title="Devotional — Lead Like Jesus"
      subtitle="Read the latest post together, then capture takeaways."
    >
      <div className="space-y-3">
        <Button asChild variant="outline" size="sm">
          <a href="https://leadlikejesus.com/blog/" target="_blank" rel="noreferrer">
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
            Open Lead Like Jesus blog
          </a>
        </Button>
        <NotesField
          meetingId={meetingId}
          sectionKey="devotional"
          placeholder="Post title, key thoughts, discussion…"
          rows={4}
        />
      </div>
    </StandingSection>
  );
}


/* ---------- 4. Sunday Review ---------- */

type SundayReview = {
  id: string;
  service_date: string;
  worship_rating: number | null;
  sermon_rating: number | null;
  connect_rating: number | null;
  confession_rating: number | null;
  worship_notes: string | null;
  sermon_notes: string | null;
  connect_notes: string | null;
  confession_notes: string | null;
  wins: string | null;
  opportunities: string | null;
};

function RatingPill({ label, value }: { label: string; value: number | null }) {
  const v = value ?? 0;
  const tone =
    v >= 4 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : v === 3 ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
    : v > 0 ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
    : "bg-muted text-muted-foreground";
  return (
    <div className={cn("rounded-lg px-3 py-2 flex items-center justify-between", tone)}>
      <span className="text-xs font-medium">{label}</span>
      <span className="text-sm font-display font-bold">{value ?? "—"}/5</span>
    </div>
  );
}

export function SundayReviewSection({ meetingId }: { meetingId: string }) {
  const [reviews, setReviews] = useState<SundayReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const since = format(subDays(new Date(), 14), "yyyy-MM-dd");
      const { data } = await supabase
        .from("sunday_reviews")
        .select("*")
        .gte("service_date", since)
        .order("service_date", { ascending: false });
      setReviews((data ?? []) as SundayReview[]);
      setLoading(false);
    })();
  }, []);

  const latestDate = reviews[0]?.service_date;
  const latest = reviews.filter((r) => r.service_date === latestDate);

  return (
    <StandingSection
      title="Sunday Review"
      subtitle={
        latestDate
          ? `Submissions for ${format(new Date(latestDate + "T12:00"), "EEE, MMM d")}`
          : "Most recent staff submissions"
      }
      badge={
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">
          {latest.length} {latest.length === 1 ? "submission" : "submissions"}
        </span>
      }
    >
      {loading ? (
        <div className="text-sm text-muted-foreground py-4">Loading…</div>
      ) : latest.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4">
          No recent submissions.{" "}
          <Link to="/sunday-review" className="text-primary underline">
            Submit one
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Aggregate ratings */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <RatingPill label="Worship" value={avg(latest.map((r) => r.worship_rating))} />
            <RatingPill label="Sermon" value={avg(latest.map((r) => r.sermon_rating))} />
            <RatingPill label="Connect" value={avg(latest.map((r) => r.connect_rating))} />
            <RatingPill label="Confession" value={avg(latest.map((r) => r.confession_rating))} />
          </div>

          {/* Wins / opportunities aggregated */}
          <div className="grid md:grid-cols-2 gap-3">
            <div className="bg-background/40 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Wins</div>
              <ul className="text-sm space-y-1.5 list-disc list-inside">
                {latest.filter((r) => r.wins?.trim()).map((r) => (
                  <li key={`w-${r.id}`}>{r.wins}</li>
                ))}
                {latest.every((r) => !r.wins?.trim()) && (
                  <li className="text-muted-foreground italic list-none">No wins logged</li>
                )}
              </ul>
            </div>
            <div className="bg-background/40 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Opportunities</div>
              <ul className="text-sm space-y-1.5 list-disc list-inside">
                {latest.filter((r) => r.opportunities?.trim()).map((r) => (
                  <li key={`o-${r.id}`}>{r.opportunities}</li>
                ))}
                {latest.every((r) => !r.opportunities?.trim()) && (
                  <li className="text-muted-foreground italic list-none">None logged</li>
                )}
              </ul>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Button asChild variant="outline" size="sm">
              <Link to="/sunday-review">Open full Sunday Review</Link>
            </Button>
          </div>

          <NotesField meetingId={meetingId} sectionKey="sunday_review" placeholder="Discussion notes…" />
        </div>
      )}
    </StandingSection>
  );
}

function avg(nums: (number | null)[]): number | null {
  const v = nums.filter((n): n is number => typeof n === "number" && n > 0);
  if (!v.length) return null;
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 as any;
}

/* ---------- 5. & 11. Events sections ---------- */

function EventList({
  meetingId,
  rangeStart,
  rangeEnd,
  emptyText,
  showCategoryFilter = false,
  filterStorageKey,
}: {
  meetingId: string;
  rangeStart: Date;
  rangeEnd: Date;
  emptyText: string;
  showCategoryFilter?: boolean;
  filterStorageKey?: string;
}) {
  const [events, setEvents] = useState<EventRowLike[]>([]);
  const [eventNotes, setEventNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [excluded, setExcluded] = useState<Set<string>>(() => {
    if (!filterStorageKey || typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(filterStorageKey);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    if (!filterStorageKey || typeof window === "undefined") return;
    localStorage.setItem(filterStorageKey, JSON.stringify(Array.from(excluded)));
  }, [excluded, filterStorageKey]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("calendar_events")
        .select("id,title,start_at,end_at,sub_calendar,leader_name,category,all_day,rrule,excluded_dates")
        .or(
          `and(start_at.gte.${rangeStart.toISOString()},start_at.lte.${rangeEnd.toISOString()}),rrule.not.is.null`,
        );
      setEvents((data ?? []) as EventRowLike[]);

      const { data: notes } = await supabase
        .from("meeting_event_notes")
        .select("event_id,occurrence_date,notes")
        .eq("meeting_id", meetingId);
      const map: Record<string, string> = {};
      (notes ?? []).forEach((n: any) => {
        map[`${n.event_id}__${n.occurrence_date}`] = n.notes ?? "";
      });
      setEventNotes(map);
      setLoading(false);
    })();
  }, [meetingId, rangeStart.getTime(), rangeEnd.getTime()]);

  const occurrences = useMemo(
    () => expandEvents(events, rangeStart, rangeEnd),
    [events, rangeStart.getTime(), rangeEnd.getTime()],
  );

  const SUB_CAL_LABELS: Record<string, string> = {
    forest_hills_main: "Forest Hills Main",
    coah_lm: "COAH LM",
    youth: "Youth",
  };
  const labelFor = (s: string) => SUB_CAL_LABELS[s] ?? s;

  const subCalendars = useMemo(() => {
    const s = new Set<string>();
    occurrences.forEach((o) => s.add(o.sub_calendar || "other"));
    return Array.from(s).sort();
  }, [occurrences]);

  const categoryList = useMemo(() => {
    const s = new Set<string>();
    occurrences.forEach((o) => {
      if (o.category && o.category.trim()) s.add(o.category);
    });
    return Array.from(s).sort();
  }, [occurrences]);

  const visible = useMemo(
    () =>
      occurrences.filter(
        (o) =>
          !excluded.has(`sub:${o.sub_calendar || "other"}`) &&
          !(o.category && excluded.has(`cat:${o.category}`)),
      ),
    [occurrences, excluded],
  );

  function toggleKey(key: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function saveNote(eventId: string, occDate: Date, val: string) {
    const iso = format(occDate, "yyyy-MM-dd");
    setEventNotes((prev) => ({ ...prev, [`${eventId}__${iso}`]: val }));
    await supabase
      .from("meeting_event_notes")
      .upsert(
        { meeting_id: meetingId, event_id: eventId, occurrence_date: iso, notes: val },
        { onConflict: "meeting_id,event_id,occurrence_date" },
      );
  }

  if (loading) return <div className="text-sm text-muted-foreground py-4">Loading…</div>;

  function FilterRow({ label, items, prefix }: { label: string; items: string[]; prefix: "sub" | "cat" }) {
    if (items.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
          {label}
        </span>
        {items.map((c) => {
          const key = `${prefix}:${c}`;
          const on = !excluded.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleKey(key)}
              className={cn(
                "text-[11px] px-2 py-0.5 rounded-full border transition-colors",
                on
                  ? "bg-primary/15 border-primary/30 text-foreground"
                  : "bg-transparent border-border text-muted-foreground line-through",
              )}
            >
              {prefix === "sub" ? labelFor(c) : c}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {showCategoryFilter && (
        <div className="space-y-1.5">
          <FilterRow label="Calendar" items={subCalendars} prefix="sub" />
          <FilterRow label="Category" items={categoryList} prefix="cat" />
          {excluded.size > 0 && (
            <button
              type="button"
              onClick={() => setExcluded(new Set())}
              className="text-[11px] text-muted-foreground hover:text-foreground underline"
            >
              reset filters
            </button>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="text-sm text-muted-foreground py-2">{emptyText}</div>
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((o) => {
            const iso = format(o.occurrence_date, "yyyy-MM-dd");
            const key = `${o.id}__${iso}`;
            return (
              <li key={key} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-xs font-mono text-muted-foreground">
                    {format(o.occurrence_date, "EEE MMM d")}
                    {!o.all_day && ` · ${format(o.occurrence_date, "h:mma").toLowerCase()}`}
                  </span>
                  <span className="text-sm font-medium">{o.title}</span>
                  {o.leader_name && (
                    <span className="text-xs text-muted-foreground">— {o.leader_name}</span>
                  )}
                  {o.category && (
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {o.category}
                    </span>
                  )}
                </div>
                <Input
                  value={eventNotes[key] ?? ""}
                  onChange={(e) => saveNote(o.id, o.occurrence_date, e.target.value)}
                  placeholder="Discussion note…"
                  className="mt-2 h-8 text-xs"
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function LastWeekEventsSection({ meetingId }: { meetingId: string }) {
  const rangeEnd = useMemo(() => new Date(), []);
  const rangeStart = useMemo(() => subDays(startOfDay(rangeEnd), 14), [rangeEnd]);
  return (
    <StandingSection
      title="Last Week's Events"
      subtitle="Events from the previous 14 days — review and discuss."
    >
      <EventList
        meetingId={meetingId}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        emptyText="No events match the current filter."
        showCategoryFilter
        filterStorageKey="meeting:last-week-events:excluded-categories"
      />
    </StandingSection>
  );
}

export function UpcomingEventsSection({ meetingId }: { meetingId: string }) {
  const rangeStart = useMemo(() => new Date(), []);
  const rangeEnd = useMemo(() => addDays(rangeStart, 90), [rangeStart]);
  return (
    <StandingSection
      title="Upcoming Events"
      subtitle="Next 90 days across all sub-calendars."
      defaultOpen={false}
    >
      <EventList
        meetingId={meetingId}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        emptyText="No events match the current filter."
        showCategoryFilter
        filterStorageKey="meeting:upcoming-events:excluded-categories"
      />
    </StandingSection>
  );
}

/* ---------- 6. & 7. PCO link sections ---------- */

export function LinkSection({
  meetingId,
  sectionKey,
  title,
  subtitle,
  href,
  linkLabel,
}: {
  meetingId: string;
  sectionKey: string;
  title: string;
  subtitle: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <StandingSection title={title} subtitle={subtitle} defaultOpen={false}>
      <div className="space-y-3">
        <Button asChild variant="outline" size="sm">
          <a href={href} target="_blank" rel="noreferrer">
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
            {linkLabel}
          </a>
        </Button>
        <NotesField meetingId={meetingId} sectionKey={sectionKey} placeholder="Submissions reviewed, follow-ups…" />
      </div>
    </StandingSection>
  );
}

/* ---------- 8. Review Trends ---------- */

type TrendsReport = {
  id: string;
  fiscal_year: number;
  month: number;
  label: string | null;
  file_path: string;
  file_name: string;
  created_at: string;
  uploaded_by: string | null;
  parsed_metrics: ParsedMetrics | null;
};

export function ReviewTrendsSection({ meetingId, meetingDate }: { meetingId: string; meetingDate: string }) {
  const { user, hasRole } = useAuth();
  const canUpload = hasRole("core");
  const [reports, setReports] = useState<TrendsReport[]>([]);
  const [prevReports, setPrevReports] = useState<TrendsReport[]>([]);
  const [uploading, setUploading] = useState(false);
  const [reparsing, setReparsing] = useState<string | null>(null);

  const md = new Date(meetingDate + "T12:00");
  const fy = md.getFullYear();
  const month = md.getMonth() + 1;
  const prev = new Date(fy, month - 2, 1);
  const prevFy = prev.getFullYear();
  const prevMonth = prev.getMonth() + 1;

  async function load() {
    const [{ data: cur }, { data: pr }] = await Promise.all([
      supabase.from("finance_reports").select("*").eq("report_type", "trends")
        .eq("fiscal_year", fy).eq("month", month).order("created_at", { ascending: false }),
      supabase.from("finance_reports").select("*").eq("report_type", "trends")
        .eq("fiscal_year", prevFy).eq("month", prevMonth).order("created_at", { ascending: false }).limit(1),
    ]);
    setReports((cur ?? []) as TrendsReport[]);
    setPrevReports((pr ?? []) as TrendsReport[]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fy, month]);

  async function upload(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `trends/${fy}/${String(month).padStart(2, "0")}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("finance-reports").upload(path, file);
      if (upErr) throw upErr;

      let parsed: ParsedMetrics | null = null;
      if (/pdf/i.test(file.type) || /\.pdf$/i.test(file.name)) {
        try {
          parsed = await parseMetricsPdf(file);
        } catch (e) {
          console.warn("PDF parse failed", e);
        }
      }

      const { error } = await supabase.from("finance_reports").insert({
        fiscal_year: fy,
        month,
        label: `Trends — ${format(md, "MMM d, yyyy")}`,
        file_path: path,
        file_name: file.name,
        mime_type: file.type,
        uploaded_by: user?.id,
        report_type: "trends",
        parsed_metrics: parsed as never,
      });
      if (error) throw error;
      toast.success(parsed ? "Trends report uploaded & parsed" : "Trends report uploaded");
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function reparse(r: TrendsReport) {
    setReparsing(r.id);
    try {
      const { data, error } = await supabase.storage.from("finance-reports").download(r.file_path);
      if (error) throw error;
      const parsed = await parseMetricsPdf(data);
      const { error: upErr } = await supabase.from("finance_reports")
        .update({ parsed_metrics: parsed as never }).eq("id", r.id);
      if (upErr) throw upErr;
      toast.success("Re-parsed");
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Parse failed");
    } finally {
      setReparsing(null);
    }
  }

  async function download(r: TrendsReport) {
    const { data, error } = await supabase.storage
      .from("finance-reports")
      .createSignedUrl(r.file_path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  }

  async function remove(r: TrendsReport) {
    if (!confirm(`Delete "${r.file_name}"?`)) return;
    await supabase.storage.from("finance-reports").remove([r.file_path]);
    await supabase.from("finance_reports").delete().eq("id", r.id);
    load();
  }

  const current = reports[0] ?? null;
  const previous = prevReports[0] ?? null;

  return (
    <StandingSection
      title="Review Trends"
      subtitle="Church metrics + this week's exported report."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="https://churchmetrics.lovable.app/" target="_blank" rel="noreferrer">
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              Open Church Metrics
            </a>
          </Button>
          {canUpload && (
            <label className="inline-flex">
              <input
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(f);
                  e.target.value = "";
                }}
              />
              <Button asChild size="sm" disabled={uploading}>
                <span>
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  {uploading ? "Uploading…" : "Upload trends report"}
                </span>
              </Button>
            </label>
          )}
        </div>

        {current ? (
          <ReportCard
            r={current}
            previous={previous}
            onDownload={download}
            onRemove={canUpload ? remove : undefined}
            onReparse={canUpload ? reparse : undefined}
            reparsing={reparsing === current.id}
            monthLabel={format(md, "MMMM yyyy")}
            previousMonthLabel={format(prev, "MMMM yyyy")}
          />
        ) : (
          <div className="text-xs text-muted-foreground italic">
            No trends report uploaded for {format(md, "MMMM yyyy")} yet.
          </div>
        )}

        {reports.length > 1 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              {reports.length - 1} earlier upload{reports.length - 1 === 1 ? "" : "s"} this month
            </summary>
            <div className="mt-2 space-y-1.5">
              {reports.slice(1).map((r) => (
                <FileRow key={r.id} r={r} onDownload={download} onRemove={canUpload ? remove : undefined} />
              ))}
            </div>
          </details>
        )}

        <NotesField meetingId={meetingId} sectionKey="review_trends" placeholder="Trend takeaways…" />
      </div>
    </StandingSection>
  );
}

function FileRow({
  r, onDownload, onRemove,
}: {
  r: TrendsReport;
  onDownload: (r: TrendsReport) => void;
  onRemove?: (r: TrendsReport) => void;
}) {
  return (
    <div className="flex items-center gap-2 bg-background/40 rounded-lg px-3 py-2">
      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <button onClick={() => onDownload(r)} className="text-xs font-medium truncate hover:underline text-left">
          {r.label || r.file_name}
        </button>
        <div className="text-[10px] text-muted-foreground">
          Uploaded {format(new Date(r.created_at), "MMM d, h:mma")}
        </div>
      </div>
      <button onClick={() => onDownload(r)} className="opacity-60 hover:opacity-100" title="Download">
        <Download className="w-3.5 h-3.5" />
      </button>
      {onRemove && (
        <button onClick={() => onRemove(r)} className="opacity-60 hover:opacity-100 text-destructive" title="Delete">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function ReportCard({
  r, previous, onDownload, onRemove, onReparse, reparsing, monthLabel, previousMonthLabel,
}: {
  r: TrendsReport;
  previous: TrendsReport | null;
  onDownload: (r: TrendsReport) => void;
  onRemove?: (r: TrendsReport) => void;
  onReparse?: (r: TrendsReport) => void;
  reparsing: boolean;
  monthLabel: string;
  previousMonthLabel: string;
}) {
  const m = r.parsed_metrics;
  const pm = previous?.parsed_metrics ?? null;

  return (
    <div className="bg-background/40 border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <button onClick={() => onDownload(r)} className="text-sm font-medium truncate hover:underline text-left block">
            {r.label || r.file_name}
          </button>
          <div className="text-[10px] text-muted-foreground">
            {m?.range ?? `Uploaded ${format(new Date(r.created_at), "MMM d, h:mma")}`}
          </div>
        </div>
        <button onClick={() => onDownload(r)} className="opacity-60 hover:opacity-100" title="Download / open">
          <Download className="w-3.5 h-3.5" />
        </button>
        {onReparse && (
          <button onClick={() => onReparse(r)} disabled={reparsing} className="opacity-60 hover:opacity-100" title="Re-parse PDF">
            {reparsing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
          </button>
        )}
        {onRemove && (
          <button onClick={() => onRemove(r)} className="opacity-60 hover:opacity-100 text-destructive" title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {!m ? (
        <div className="px-3 py-3 text-xs text-muted-foreground italic">
          No extracted stats. {onReparse ? "Click the parse button above to extract." : ""}
        </div>
      ) : (
        <div className="p-3 space-y-4">
          <HeadlineTiles m={m} pm={pm} previousMonthLabel={previousMonthLabel} monthLabel={monthLabel} />

          {m.ratios.length > 0 && (
            <Block title="Key ratios">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {m.ratios.map((r) => (
                  <div key={r.label} className="bg-surface rounded-md px-2 py-1.5">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.label}</div>
                    <div className="text-sm font-semibold tabular-nums">{r.value}</div>
                  </div>
                ))}
              </div>
            </Block>
          )}

          {m.period_comparison.length > 0 && (
            <Block title="Period comparison">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="text-left font-normal py-1">Metric</th>
                      <th className="text-right font-normal py-1">Current</th>
                      <th className="text-right font-normal py-1">Previous</th>
                      <th className="text-right font-normal py-1">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.period_comparison.map((row) => {
                      const pos = /^\+/.test(row.change);
                      const neg = /^-/.test(row.change);
                      return (
                        <tr key={row.metric} className="border-t border-border/40">
                          <td className="py-1">{row.metric}</td>
                          <td className="text-right tabular-nums font-medium">{row.current}</td>
                          <td className="text-right tabular-nums text-muted-foreground">{row.previous}</td>
                          <td className={cn("text-right tabular-nums", pos && "text-emerald-600", neg && "text-destructive")}>
                            {row.change}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Block>
          )}

          {m.goals.length > 0 && (
            <Block title="Goal progress">
              <div className="space-y-1.5">
                {m.goals.map((g) => {
                  const pct = parseInt(g.progress, 10);
                  const declining = /declin/i.test(g.trajectory);
                  const onTrack = /on track/i.test(g.trajectory);
                  return (
                    <div key={g.goal} className="bg-surface rounded-md px-2.5 py-2">
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <div className="text-xs font-medium capitalize">{g.goal}</div>
                        <div className="text-[11px] text-muted-foreground tabular-nums">
                          {g.actual} / {g.target}
                        </div>
                      </div>
                      <div className="h-1.5 bg-background rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            declining ? "bg-destructive" : onTrack ? "bg-emerald-500" : "bg-primary",
                          )}
                          style={{ width: `${Math.min(100, Math.max(0, isFinite(pct) ? pct : 0))}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1 text-[10px]">
                        <span className="text-muted-foreground">{g.progress}</span>
                        <span className={cn(declining && "text-destructive", onTrack && "text-emerald-600")}>
                          {g.trajectory}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Block>
          )}

          {m.weekly.length > 0 && (
            <Block title="Recent weekly data">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="text-left font-normal py-1">Week</th>
                      <th className="text-right font-normal py-1">Total</th>
                      <th className="text-right font-normal py-1">Sanc.</th>
                      <th className="text-right font-normal py-1">Kids</th>
                      <th className="text-right font-normal py-1">Giving</th>
                      <th className="text-right font-normal py-1">CG</th>
                      <th className="text-right font-normal py-1">Prayer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.weekly.map((w) => (
                      <tr key={w.week} className="border-t border-border/40">
                        <td className="py-1">{w.week}</td>
                        <td className="text-right tabular-nums">{w.total}</td>
                        <td className="text-right tabular-nums">{w.sanctuary}</td>
                        <td className="text-right tabular-nums">{w.kids}</td>
                        <td className="text-right tabular-nums">{w.giving}</td>
                        <td className="text-right tabular-nums">{w.cg}</td>
                        <td className="text-right tabular-nums">{w.prayer}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Block>
          )}

          {m.insights.length > 0 && (
            <Block title="Leadership insights">
              <ul className="space-y-1 text-xs text-muted-foreground list-disc list-inside marker:text-primary/60">
                {m.insights.map((line, i) => (
                  <li key={i} className="text-foreground/80">{line}</li>
                ))}
              </ul>
            </Block>
          )}

          {m.milestones.length > 0 && (
            <Block title="Milestones (YTD)">
              <div className="flex flex-wrap gap-2">
                {m.milestones.map((ms) => (
                  <span key={ms.label} className="text-xs bg-surface rounded-md px-2 py-1">
                    <span className="font-semibold tabular-nums mr-1">{ms.count}</span>
                    <span className="text-muted-foreground">{ms.label}</span>
                  </span>
                ))}
              </div>
            </Block>
          )}

          {previous && (
            <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/40">
              Previous month ({previousMonthLabel}) values shown in tile deltas above.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{title}</div>
      {children}
    </div>
  );
}

function HeadlineTiles({
  m, pm, previousMonthLabel, monthLabel,
}: {
  m: ParsedMetrics;
  pm: ParsedMetrics | null;
  previousMonthLabel: string;
  monthLabel: string;
}) {
  const tiles: { label: string; key: keyof ParsedMetrics["headline"]; format: (n: number) => string }[] = [
    { label: "Avg Total", key: "avg_total_attendance", format: (n) => String(n) },
    { label: "Avg Sanctuary", key: "avg_sanctuary", format: (n) => String(n) },
    { label: "Avg Kids", key: "avg_kids", format: (n) => String(n) },
    { label: "Avg Giving", key: "avg_weekly_giving", format: (n) => `$${n.toLocaleString()}` },
    { label: "Avg CG", key: "avg_community_groups", format: (n) => String(n) },
    { label: "Prayer", key: "prayer_interactions", format: (n) => String(n) },
    { label: "First Step", key: "first_step_cards", format: (n) => String(n) },
    { label: "Next Step", key: "next_step_cards", format: (n) => String(n) },
    { label: "QR Scans", key: "qr_scans", format: (n) => String(n) },
    { label: "Volunteers", key: "volunteers_added", format: (n) => String(n) },
  ];

  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
        {monthLabel} headline {pm && <span className="text-muted-foreground/70 normal-case tracking-normal">· vs {previousMonthLabel}</span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {tiles.map((t) => {
          const val = m.headline[t.key];
          if (val == null) return null;
          const prevVal = pm?.headline[t.key];
          let delta: number | null = null;
          if (typeof prevVal === "number" && prevVal > 0 && typeof val === "number") {
            delta = ((val - prevVal) / prevVal) * 100;
          }
          return (
            <div key={t.key} className="bg-surface rounded-md px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.label}</div>
              <div className="text-sm font-semibold tabular-nums">{t.format(val)}</div>
              {delta !== null && (
                <div className={cn(
                  "text-[10px] tabular-nums",
                  delta > 0 ? "text-emerald-600" : delta < 0 ? "text-destructive" : "text-muted-foreground",
                )}>
                  {delta > 0 ? "+" : ""}{delta.toFixed(1)}% vs prev
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


/* ---------- 9. Review Tasks ---------- */

type OpenAction = {
  id: string;
  title: string;
  assignee_id: string | null;
  due_date: string | null;
  meeting_id: string | null;
  created_at: string;
  google_task_pushed_at: string | null;
};

function PushToGoogleTasksButton({ actionItemId, pushedAt, onPushed }: {
  actionItemId: string; pushedAt: string | null; onPushed?: () => void;
}) {
  const push = useServerFn(pushActionItemToGoogleTasks);
  const [busy, setBusy] = useState(false);
  if (pushedAt) {
    return (
      <span className="p-1 text-emerald-600" title={`Pushed ${format(new Date(pushedAt), "MMM d")}`}>
        <Send className="w-3.5 h-3.5" />
      </span>
    );
  }
  async function go() {
    setBusy(true);
    try {
      await push({ data: { actionItemId } });
      toast.success("Pushed to Google Tasks");
      onPushed?.();
    } catch (e: any) {
      const msg = String(e.message ?? "");
      if (msg.includes("has not connected")) {
        toast.error("Assignee hasn't connected Google Tasks", {
          description: "They can link their Google account in Settings → Integrations.",
        });
      } else {
        toast.error(msg || "Failed to push");
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      onClick={go}
      disabled={busy}
      className="p-1 text-muted-foreground hover:text-primary transition-colors"
      title="Push to assignee's Google Tasks"
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
    </button>
  );
}

function DueDatePicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(value + "T12:00") : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 hover:bg-background border border-transparent hover:border-border transition-colors",
            value ? "text-foreground" : "text-muted-foreground",
          )}
          title="Set due date"
        >
          <CalendarIcon className="w-3 h-3" />
          {value ? format(date!, "MMM d") : "Add due date"}
          {value && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onChange(null); }}
              className="ml-0.5 hover:text-destructive"
            >
              <X className="w-3 h-3" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            onChange(d ? format(d, "yyyy-MM-dd") : null);
            setOpen(false);
          }}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}

type ProfileLite = { id: string; full_name: string | null; email: string | null };

export function ReviewTasksSection() {
  const [actions, setActions] = useState<OpenAction[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const pushBulk = useServerFn(pushActionItemsBulk);

  async function load() {
    const [{ data: a }, { data: p }] = await Promise.all([
      supabase
        .from("action_items")
        .select("id,title,assignee_id,due_date,meeting_id,created_at,google_task_pushed_at")
        .eq("completed", false)
        .order("created_at", { ascending: true }),
      supabase.from("profiles").select("id,full_name,email"),
    ]);
    setActions((a ?? []) as OpenAction[]);
    setProfiles((p ?? []) as ProfileLite[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("review-tasks-action-items")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "action_items" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  async function complete(id: string) {
    await supabase.from("action_items").update({ completed: true }).eq("id", id);
  }
  async function reassign(id: string, assignee_id: string | null) {
    await supabase.from("action_items").update({ assignee_id }).eq("id", id);
  }
  async function setDue(id: string, due_date: string | null) {
    setActions((prev) => prev.map((a) => (a.id === id ? { ...a, due_date } : a)));
    const { error } = await supabase.from("action_items").update({ due_date }).eq("id", id);
    if (error) toast.error(error.message);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const eligible = useMemo(
    () => actions.filter((a) => !a.google_task_pushed_at && a.assignee_id),
    [actions],
  );
  const allEligibleSelected = eligible.length > 0 && eligible.every((a) => selected.has(a.id));

  function toggleSelectAll() {
    if (allEligibleSelected) setSelected(new Set());
    else setSelected(new Set(eligible.map((a) => a.id)));
  }

  async function pushSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const { results } = await pushBulk({ data: { actionItemIds: ids } });
      const ok = results.filter((r) => r.ok).length;
      const failed = results.length - ok;
      if (ok > 0) toast.success(`Pushed ${ok} task${ok === 1 ? "" : "s"} to Google Tasks`);
      if (failed > 0) {
        const firstErr = results.find((r) => !r.ok)?.error;
        toast.error(`${failed} failed${firstErr ? `: ${firstErr}` : ""}`);
      }
      setSelected(new Set());
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Bulk push failed");
    } finally {
      setBulkBusy(false);
    }
  }

  const grouped = useMemo(() => {
    const m = new Map<string | null, OpenAction[]>();
    actions.forEach((a) => {
      const k = a.assignee_id ?? null;
      const arr = m.get(k) ?? [];
      arr.push(a);
      m.set(k, arr);
    });
    return Array.from(m.entries());
  }, [actions]);

  function nameFor(id: string | null) {
    if (!id) return "Unassigned";
    const p = profiles.find((x) => x.id === id);
    return p?.full_name || p?.email || "Unknown";
  }

  return (
    <StandingSection
      title="Review Tasks"
      subtitle="All open action items, grouped by who owns them."
      badge={
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">
          {actions.length} open
        </span>
      }
    >
      {loading ? (
        <div className="text-sm text-muted-foreground py-4">Loading…</div>
      ) : actions.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4">
          🎉 No open action items.
        </div>
      ) : (
        <div className="space-y-4">
          {eligible.length > 0 && (
            <div className="flex items-center justify-between gap-2 bg-background/40 rounded-lg px-3 py-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox checked={allEligibleSelected} onCheckedChange={toggleSelectAll} />
                <span className="text-muted-foreground">
                  {selected.size > 0
                    ? `${selected.size} selected`
                    : `Select all (${eligible.length} ready to push)`}
                </span>
              </label>
              <Button
                size="sm"
                disabled={selected.size === 0 || bulkBusy}
                onClick={pushSelected}
              >
                {bulkBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : (
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                )}
                Push {selected.size > 0 ? selected.size : ""} to Google Tasks
              </Button>
            </div>
          )}

          {grouped.map(([assigneeId, items]) => (
            <div key={String(assigneeId)} className="space-y-1.5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {nameFor(assigneeId)} ({items.length})
              </div>
              <ul className="space-y-1.5">
                {items.map((a) => {
                  const canSelect = !a.google_task_pushed_at && !!a.assignee_id;
                  return (
                    <li
                      key={a.id}
                      className="flex items-start gap-2 bg-background/40 rounded-lg px-3 py-2"
                    >
                      <div className="pt-0.5">
                        {canSelect ? (
                          <Checkbox
                            checked={selected.has(a.id)}
                            onCheckedChange={() => toggleSelect(a.id)}
                          />
                        ) : (
                          <div className="w-4 h-4" />
                        )}
                      </div>
                      <button
                        onClick={() => complete(a.id)}
                        className="mt-0.5 w-4 h-4 rounded border border-border shrink-0 hover:bg-primary/20"
                        title="Mark complete"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">{a.title}</div>
                        <div className="mt-0.5">
                          <DueDatePicker value={a.due_date} onChange={(d) => setDue(a.id, d)} />
                        </div>
                      </div>
                      <Select
                        value={a.assignee_id ?? "unassigned"}
                        onValueChange={(v) => reassign(a.id, v === "unassigned" ? null : v)}
                      >
                        <SelectTrigger className="h-7 w-[8rem] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {profiles.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.full_name || p.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <PushToGoogleTasksButton
                        actionItemId={a.id}
                        pushedAt={a.google_task_pushed_at}
                        onPushed={load}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </StandingSection>
  );
}

/* ---------- visual divider ---------- */

export function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <div className="h-px bg-border flex-1" />
      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <div className="h-px bg-border flex-1" />
    </div>
  );
}
