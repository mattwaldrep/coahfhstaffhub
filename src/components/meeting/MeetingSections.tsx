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
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { pushActionItemToGoogleTasks } from "@/server/google-tasks.functions";
import { toast } from "sonner";
import { expandEvents, type EventRowLike } from "@/lib/calendar-expand";
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

  const categories = useMemo(() => {
    const s = new Set<string>();
    occurrences.forEach((o) => s.add(o.sub_calendar || "other"));
    return Array.from(s).sort();
  }, [occurrences]);

  const visible = useMemo(
    () => occurrences.filter((o) => !excluded.has(o.sub_calendar || "other")),
    [occurrences, excluded],
  );

  function toggleCat(cat: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
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

  return (
    <div className="space-y-3">
      {showCategoryFilter && categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
            Filter
          </span>
          {categories.map((c) => {
            const on = !excluded.has(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleCat(c)}
                className={cn(
                  "text-[11px] px-2 py-0.5 rounded-full border transition-colors",
                  on
                    ? "bg-primary/15 border-primary/30 text-foreground"
                    : "bg-transparent border-border text-muted-foreground line-through",
                )}
              >
                {labelFor(c)}
              </button>
            );
          })}
          {excluded.size > 0 && (
            <button
              type="button"
              onClick={() => setExcluded(new Set())}
              className="text-[11px] text-muted-foreground hover:text-foreground underline ml-1"
            >
              reset
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
};

export function ReviewTrendsSection({ meetingId, meetingDate }: { meetingId: string; meetingDate: string }) {
  const { user, hasRole } = useAuth();
  const canUpload = hasRole("core");
  const [reports, setReports] = useState<TrendsReport[]>([]);
  const [uploading, setUploading] = useState(false);

  const md = new Date(meetingDate + "T12:00");
  const fy = md.getFullYear();
  const month = md.getMonth() + 1;

  async function load() {
    const { data } = await supabase
      .from("finance_reports")
      .select("*")
      .eq("report_type", "trends")
      .eq("fiscal_year", fy)
      .eq("month", month)
      .order("created_at", { ascending: false });
    setReports((data ?? []) as TrendsReport[]);
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
      const { error } = await supabase.from("finance_reports").insert({
        fiscal_year: fy,
        month,
        label: `Trends — ${format(md, "MMM d, yyyy")}`,
        file_path: path,
        file_name: file.name,
        mime_type: file.type,
        uploaded_by: user?.id,
        report_type: "trends",
      });
      if (error) throw error;
      toast.success("Trends report uploaded");
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
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

  return (
    <StandingSection
      title="Review Trends"
      subtitle="Church metrics + this week's exported report."
    >
      <div className="space-y-3">
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
                accept=".pdf,.xlsx,.xls,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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

        {reports.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">
            No trends report uploaded for {format(md, "MMMM yyyy")} yet.
          </div>
        ) : (
          <div className="space-y-1.5">
            {reports.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 bg-background/40 rounded-lg px-3 py-2"
              >
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{r.label || r.file_name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    Uploaded {format(new Date(r.created_at), "MMM d, h:mma")}
                  </div>
                </div>
                <button onClick={() => download(r)} className="opacity-60 hover:opacity-100" title="Download">
                  <Download className="w-3.5 h-3.5" />
                </button>
                {canUpload && (
                  <button
                    onClick={() => remove(r)}
                    className="opacity-60 hover:opacity-100 text-destructive"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <NotesField meetingId={meetingId} sectionKey="review_trends" placeholder="Trend takeaways…" />
      </div>
    </StandingSection>
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

function PushToGoogleTasksButton({ actionItemId, pushedAt }: { actionItemId: string; pushedAt: string | null }) {
  const push = useServerFn(pushActionItemToGoogleTasks);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(!!pushedAt);
  async function go() {
    setBusy(true);
    try {
      await push({ data: { actionItemId } });
      setDone(true);
      toast.success("Pushed to Google Tasks");
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
      className={cn(
        "p-1 transition-colors",
        done ? "text-emerald-600" : "text-muted-foreground hover:text-primary",
      )}
      title={done ? "Pushed to Google Tasks" : "Push to assignee's Google Tasks"}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
    </button>
  );
}

type ProfileLite = { id: string; full_name: string | null; email: string | null };

export function ReviewTasksSection() {
  const [actions, setActions] = useState<OpenAction[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [loading, setLoading] = useState(true);

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
          {grouped.map(([assigneeId, items]) => (
            <div key={String(assigneeId)} className="space-y-1.5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {nameFor(assigneeId)} ({items.length})
              </div>
              <ul className="space-y-1.5">
                {items.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-start gap-2 bg-background/40 rounded-lg px-3 py-2"
                  >
                    <button
                      onClick={() => complete(a.id)}
                      className="mt-0.5 w-4 h-4 rounded border border-border shrink-0 hover:bg-primary/20"
                      title="Mark complete"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">{a.title}</div>
                      {a.due_date && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          Due {format(new Date(a.due_date + "T12:00"), "MMM d")}
                        </div>
                      )}
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
                    <PushToGoogleTasksButton actionItemId={a.id} pushedAt={(a as any).google_task_pushed_at ?? null} />
                  </li>
                ))}
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
