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
  Send,
  Loader2,
  CalendarIcon,
  X,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getLatestLeadLikeJesusPost, type LLJPost } from "@/lib/lead-like-jesus.functions";
import { pushActionItemToGoogleTasks, pushActionItemsBulk, autoPushIfEnabled, setActionItemCompleted } from "@/lib/google-tasks.functions";
import { TaskSourceButton } from "@/components/tasks/TaskSourceButton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { expandEvents, type EventRowLike } from "@/lib/calendar-expand";
import { classGaps } from "@/lib/class-gaps";
import { InlineClassFixer } from "@/components/inline/InlineClassFixer";
import { fetchWeeksInRange, summarizeWeeks, type WeeklyMetric, type MetricsHeadline } from "@/integrations/metrics/client";
import { useMetricsSession } from "@/integrations/metrics/use-session";
import { cn } from "@/lib/utils";
import { pushSundaySlotsToPco, type PushSlotResult } from "@/lib/pco-services.functions";

/* ---------- shared collapsible card ---------- */

export function StandingSection({
  title,
  subtitle,
  defaultOpen = false,
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
  const fetchPost = useServerFn(getLatestLeadLikeJesusPost);
  const [post, setPost] = useState<LLJPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPost()
      .then((r) => {
        if (cancelled) return;
        setPost(r.post);
        setError(r.error ?? null);
      })
      .catch((e) => !cancelled && setError(e?.message ?? "Failed to load"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fetchPost]);

  return (
    <StandingSection
      title="Devotional — Lead Like Jesus"
      subtitle="Read the latest post together, then capture takeaways."
    >
      <div className="space-y-3">
        {loading ? (
          <div className="text-sm text-muted-foreground inline-flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading latest post…
          </div>
        ) : post ? (
          <div className="rounded-lg border border-border bg-background/40 p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <h4 className="font-display font-semibold text-base leading-tight">{post.title}</h4>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {format(new Date(post.date), "MMM d, yyyy")} · leadlikejesus.com
                </div>
              </div>
              <Button asChild variant="ghost" size="sm" className="shrink-0">
                <a href={post.link} target="_blank" rel="noreferrer">
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  Open
                </a>
              </Button>
            </div>
            <div
              className="prose prose-sm dark:prose-invert max-w-none [&_img]:rounded-md [&_a]:text-primary"
              style={expanded ? undefined : { maxHeight: "12rem", overflow: "hidden", maskImage: "linear-gradient(to bottom, black 70%, transparent)" }}
              dangerouslySetInnerHTML={{ __html: post.contentHtml }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setExpanded((v) => !v)}
            >
              <ChevronDown className={`w-3.5 h-3.5 mr-1.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
              {expanded ? "Show less" : "Read full post"}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              {error ? `Couldn't load the latest post (${error}).` : "No post available."}
            </div>
            <Button asChild variant="outline" size="sm">
              <a href="https://leadlikejesus.com/blog/" target="_blank" rel="noreferrer">
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Open Lead Like Jesus blog
              </a>
            </Button>
          </div>
        )}
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

  // Anchor to the most recent Sunday (today if Sunday), not the max submitted
  // date — otherwise a stray off-by-one submission hides everyone else's.
  const lastSunday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    return format(d, "yyyy-MM-dd");
  })();
  const latestDate = lastSunday;
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

function ReadinessDot({ r }: { r: "green" | "yellow" | "red" }) {
  const color = r === "green" ? "bg-success" : r === "yellow" ? "bg-warning" : "bg-destructive";
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} aria-label={`Readiness ${r}`} />;
}

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
  type EventRow = EventRowLike & { readiness?: "green" | "yellow" | "red" | null };
  const [events, setEvents] = useState<EventRow[]>([]);
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
        .select("id,title,start_at,end_at,sub_calendar,leader_name,category,all_day,rrule,excluded_dates,readiness")
        .or(
          `and(start_at.gte.${rangeStart.toISOString()},start_at.lte.${rangeEnd.toISOString()}),rrule.not.is.null`,
        );
      setEvents((data ?? []) as EventRow[]);

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
                  <Link
                    to="/calendar"
                    search={{ event: o.id }}
                    className="text-sm font-medium hover:underline inline-flex items-center gap-1.5"
                  >
                    <span>{o.title}</span>
                    {o.readiness && <ReadinessDot r={o.readiness} />}
                  </Link>
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
  const rangeStart = useMemo(() => subDays(startOfDay(rangeEnd), 7), [rangeEnd]);
  return (
    <StandingSection
      title="Last Week's Events"
      subtitle="Events from the previous 7 days — review and discuss."
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

/* ---------- This Sunday's slot (Ministry Highlight + 2 Announcements) ---------- */



const SUNDAY_SLOTS = [
  { key: "ministry_highlight", label: "Ministry Highlight" },
  { key: "announcement_1", label: "Announcement 1" },
  { key: "announcement_2", label: "Announcement 2" },
] as const;

type SundaySlotKey = (typeof SUNDAY_SLOTS)[number]["key"];

type SundaySlotRow = {
  id: string;
  channel: SundaySlotKey;
  event_id: string | null;
  text_label: string | null;
  title: string;
};

export function ThisSundaySection({ meetingDate }: { meetingDate: string }) {
  const targetSunday = useMemo(() => {
    const d = new Date(meetingDate + "T12:00:00");
    const day = d.getDay();
    return addDays(startOfDay(d), (7 - day) % 7);
  }, [meetingDate]);
  const sundayIso = format(targetSunday, "yyyy-MM-dd");
  const sundayLabel = format(targetSunday, "EEEE, MMM d");

  const [byChannel, setByChannel] = useState<Partial<Record<SundaySlotKey, SundaySlotRow>>>({});
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);
  const [editingSlot, setEditingSlot] = useState<SundaySlotKey | null>(null);
  const [pushing, setPushing] = useState(false);
  const pushFn = useServerFn(pushSundaySlotsToPco);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: slots } = await supabase
        .from("event_sunday_slots" as any)
        .select("id, channel, event_id, text_label")
        .eq("sunday_date", sundayIso);
      const slotRows = ((slots ?? []) as unknown as Array<{
        id: string; channel: SundaySlotKey; event_id: string | null; text_label: string | null;
      }>);
      const ids = Array.from(new Set(slotRows.map((s) => s.event_id).filter(Boolean) as string[]));
      const titles: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: evs } = await supabase
          .from("calendar_events").select("id, title").in("id", ids);
        for (const e of (evs ?? []) as Array<{ id: string; title: string }>) titles[e.id] = e.title;
      }
      if (!mounted) return;
      const map: Partial<Record<SundaySlotKey, SundaySlotRow>> = {};
      for (const s of slotRows) {
        map[s.channel] = {
          id: s.id,
          channel: s.channel,
          event_id: s.event_id,
          text_label: s.text_label,
          title: s.event_id ? (titles[s.event_id] ?? "(untitled)") : (s.text_label ?? ""),
        };
      }
      setByChannel(map);
      setLoaded(true);
    })();
    return () => { mounted = false; };
  }, [sundayIso, tick]);

  const filledCount = SUNDAY_SLOTS.reduce((n, s) => n + (byChannel[s.key] ? 1 : 0), 0);

  async function saveSlot(channel: SundaySlotKey, payload: { text_label?: string; event_id?: string }) {
    await supabase
      .from("event_sunday_slots" as any)
      .delete()
      .eq("sunday_date", sundayIso)
      .eq("channel", channel);
    const { error } = await supabase.from("event_sunday_slots" as any).insert({
      sunday_date: sundayIso,
      channel,
      text_label: payload.text_label ?? null,
      event_id: payload.event_id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    setEditingSlot(null);
    setTick((t) => t + 1);
  }

  async function clearSlot(channel: SundaySlotKey) {
    const { error } = await supabase
      .from("event_sunday_slots" as any)
      .delete()
      .eq("sunday_date", sundayIso)
      .eq("channel", channel);
    if (error) { toast.error(error.message); return; }
    setTick((t) => t + 1);
  }

  async function pushToPco() {
    setPushing(true);
    try {
      const res = await pushFn({ data: { sundayIso } });
      if (!res.ok) {
        toast.error(res.error ?? "Push failed");
        return;
      }
      const results: PushSlotResult[] = res.results ?? [];
      const updated = results.filter((r) => r.status === "updated");
      const missing = results.filter((r) => r.status === "missing_item");
      const empty = results.filter((r) => r.status === "empty");
      const parts = [`Updated ${updated.length} of ${SUNDAY_SLOTS.length} items`];
      if (missing.length) parts.push(`couldn't find: ${missing.map((m) => m.title).join(", ")}`);
      if (empty.length) parts.push(`skipped empty: ${empty.map((m) => m.title).join(", ")}`);
      toast.success(parts.join(" — "));
    } catch (e: any) {
      toast.error(e?.message ?? "Push failed");
    } finally {
      setPushing(false);
    }
  }

  return (
    <StandingSection
      title="This Sunday's Slot"
      subtitle={`Ministry Highlight and announcements for ${sundayLabel}.`}
      badge={
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">
          {filledCount} of {SUNDAY_SLOTS.length}
        </span>
      }
    >
      <div className="space-y-3">
        {!loaded ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-md">
            {SUNDAY_SLOTS.map((slot) => (
              <li key={slot.key} className="p-3">
                <SlotRow
                  label={slot.label}
                  row={byChannel[slot.key]}
                  editing={editingSlot === slot.key}
                  onStartEdit={() => setEditingSlot(slot.key)}
                  onCancelEdit={() => setEditingSlot(null)}
                  onClear={() => clearSlot(slot.key)}
                  onSave={(p) => saveSlot(slot.key, p)}
                />
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="text-xs text-muted-foreground">
            {filledCount === SUNDAY_SLOTS.length
              ? "All slots filled. Push to write into the PCO plan."
              : `${SUNDAY_SLOTS.length - filledCount} slot${SUNDAY_SLOTS.length - filledCount === 1 ? "" : "s"} still open.`}
          </div>
          <Button size="sm" onClick={pushToPco} disabled={pushing || filledCount === 0}>
            {pushing && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Push to PCO
          </Button>
        </div>
      </div>
    </StandingSection>
  );
}

function SlotRow({
  label, row, editing, onStartEdit, onCancelEdit, onClear, onSave,
}: {
  label: string;
  row: SundaySlotRow | undefined;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onClear: () => void;
  onSave: (p: { text_label?: string; event_id?: string }) => void;
}) {
  const [mode, setMode] = useState<"text" | "event">("text");
  const [textValue, setTextValue] = useState(row?.text_label ?? "");
  const [eventSearch, setEventSearch] = useState("");
  const [eventResults, setEventResults] = useState<Array<{ id: string; title: string; start_at: string }>>([]);
  const [pickedEvent, setPickedEvent] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    if (!editing) return;
    setMode(row?.event_id ? "event" : "text");
    setTextValue(row?.text_label ?? "");
    setPickedEvent(row?.event_id ? { id: row.event_id, title: row.title } : null);
    setEventSearch("");
    setEventResults([]);
  }, [editing, row?.event_id, row?.text_label, row?.title]);

  useEffect(() => {
    if (!editing || mode !== "event") return;
    let mounted = true;
    (async () => {
      const q = eventSearch.trim();
      const nowIso = new Date().toISOString();
      let query = supabase
        .from("calendar_events")
        .select("id, title, start_at")
        .gte("start_at", nowIso)
        .order("start_at", { ascending: true })
        .limit(25);
      if (q) query = query.ilike("title", `%${q}%`);
      const { data } = await query;
      if (!mounted) return;
      setEventResults(((data ?? []) as Array<{ id: string; title: string; start_at: string }>));
    })();
    return () => { mounted = false; };
  }, [editing, mode, eventSearch]);

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2 group">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          {row ? (
            row.event_id ? (
              <Link to="/calendar" search={{ event: row.event_id }} className="text-sm hover:underline truncate block">
                {row.title}
              </Link>
            ) : (
              <div className="text-sm truncate">{row.title}</div>
            )
          ) : (
            <div className="text-sm text-muted-foreground italic">Not chosen yet</div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onStartEdit}>
            {row ? "Edit" : "Choose"}
          </Button>
          {row && (
            <button
              type="button"
              onClick={onClear}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-1"
              aria-label="Clear"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  const canSave = mode === "text" ? textValue.trim().length > 0 : !!pickedEvent;
  const submit = () => {
    if (mode === "text") {
      const v = textValue.trim();
      if (!v) { toast.error("Enter a label"); return; }
      onSave({ text_label: v });
    } else {
      if (!pickedEvent) { toast.error("Pick an event"); return; }
      onSave({ event_id: pickedEvent.id });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="flex rounded-md border border-border overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => setMode("text")}
            className={cn("px-2.5 py-1", mode === "text" ? "bg-muted font-medium" : "text-muted-foreground")}
          >Text</button>
          <button
            type="button"
            onClick={() => setMode("event")}
            className={cn("px-2.5 py-1 border-l border-border", mode === "event" ? "bg-muted font-medium" : "text-muted-foreground")}
          >Event</button>
        </div>
      </div>

      {mode === "text" ? (
        <Input
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          placeholder="e.g., Missions update by John"
          className="h-8 text-sm"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        />
      ) : pickedEvent ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 text-sm border border-border rounded-md px-2.5 py-1.5 bg-muted/40 truncate">
            {pickedEvent.title}
          </div>
          <Button size="sm" variant="ghost" onClick={() => setPickedEvent(null)}>Change</Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            value={eventSearch}
            onChange={(e) => setEventSearch(e.target.value)}
            placeholder="Search upcoming events…"
            className="h-8 text-sm"
          />
          {eventResults.length === 0 ? (
            <div className="text-xs text-muted-foreground px-1">No upcoming events found.</div>
          ) : (
            <ul className="border border-border rounded-md divide-y divide-border max-h-48 overflow-auto">
              {eventResults.map((ev) => (
                <li key={ev.id}>
                  <button
                    type="button"
                    className="w-full text-left text-sm px-2.5 py-1.5 hover:bg-muted flex items-center justify-between gap-2"
                    onClick={() => setPickedEvent({ id: ev.id, title: ev.title })}
                  >
                    <span className="truncate">{ev.title}</span>
                    <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                      {format(new Date(ev.start_at), "EEE MMM d")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="ghost" onClick={onCancelEdit}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={!canSave}>Save</Button>
      </div>
    </div>
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

/* ---------- 8. Review Trends (live from Church Metrics) ---------- */

export function ReviewTrendsSection({ meetingId, meetingDate }: { meetingId: string; meetingDate: string }) {
  return (
    <StandingSection
      title="Review Trends"
      subtitle="Live data from Church Metrics — last 4 weeks vs prior 4."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="https://churchmetrics.lovable.app/" target="_blank" rel="noreferrer">
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              Open Church Metrics
            </a>
          </Button>
        </div>

        <LiveTrendsCard meetingDate={meetingDate} />

        <NotesField meetingId={meetingId} sectionKey="review_trends" placeholder="Trend takeaways…" />
      </div>
    </StandingSection>
  );
}

function LiveTrendsCard({ meetingDate }: { meetingDate: string }) {
  const session = useMetricsSession();
  const [rows, setRows] = useState<WeeklyMetric[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [windowWeeks, setWindowWeeks] = useState<2 | 4 | 8 | 12>(4);
  const [compare, setCompare] = useState(true);
  const [showTable, setShowTable] = useState(true);

  useEffect(() => {
    if (!session) { setRows(null); return; }
    const end = meetingDate;
    const startD = new Date(meetingDate + "T12:00");
    // fetch enough weeks for window + comparison period
    startD.setDate(startD.getDate() - 7 * (windowWeeks * 2 + 2));
    const start = format(startD, "yyyy-MM-dd");
    setErr(null);
    fetchWeeksInRange(start, end)
      .then(setRows)
      .catch((e: any) => setErr(e.message ?? "Failed to load metrics"));
  }, [session, meetingDate, windowWeeks]);

  if (!session) {
    return (
      <div className="text-xs text-muted-foreground italic bg-background/40 border border-dashed border-border rounded-xl p-4">
        Church Metrics is not connected.{" "}
        <Link to="/settings" className="underline">Connect in Settings</Link> to pull live attendance, giving and engagement.
      </div>
    );
  }
  if (err) return <div className="text-xs text-destructive">{err}</div>;
  if (rows === null) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <Loader2 className="w-3 h-3 animate-spin" /> Loading…
      </div>
    );
  }
  if (rows.length === 0) {
    return <div className="text-xs text-muted-foreground italic">No weekly metrics found in this window.</div>;
  }

  const recent = rows.slice(0, windowWeeks);
  const prior = rows.slice(windowWeeks, windowWeeks * 2);
  const m = summarizeWeeks(recent);
  const pm = compare && prior.length ? summarizeWeeks(prior) : null;

  return (
    <div className="bg-background/40 border border-border rounded-xl p-3 space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="uppercase tracking-wider text-muted-foreground font-medium">Window</span>
        {[2, 4, 8, 12].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setWindowWeeks(n as 2 | 4 | 8 | 12)}
            className={cn(
              "px-2 py-0.5 rounded-md border transition-colors",
              windowWeeks === n
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-surface border-border hover:bg-surface/70 text-muted-foreground",
            )}
          >
            {n}w
          </button>
        ))}
        <span className="mx-1 h-3 w-px bg-border" />
        <label className="inline-flex items-center gap-1 cursor-pointer text-muted-foreground">
          <input type="checkbox" className="accent-primary" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
          Compare vs prior {windowWeeks}w
        </label>
        <label className="inline-flex items-center gap-1 cursor-pointer text-muted-foreground">
          <input type="checkbox" className="accent-primary" checked={showTable} onChange={(e) => setShowTable(e.target.checked)} />
          Weekly table
        </label>
      </div>

      <HeadlineTiles m={m} pm={pm} />

      {showTable && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Recent weeks</div>
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
                {recent.map((w) => (
                  <tr key={w.id} className="border-t border-border/40">
                    <td className="py-1">{w.week_label || format(new Date(w.week_start_date + "T12:00"), "MMM d")}</td>
                    <td className="text-right tabular-nums">{fmtN(w.total_attendance)}</td>
                    <td className="text-right tabular-nums">{fmtN(w.sanctuary_attendance)}</td>
                    <td className="text-right tabular-nums">{fmtN(w.kids_attendance)}</td>
                    <td className="text-right tabular-nums">{fmtMoneyN(w.internal_giving)}</td>
                    <td className="text-right tabular-nums">{fmtN(w.community_group_attendance)}</td>
                    <td className="text-right tabular-nums">{fmtN(w.prayer_count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function fmtN(n: number | null | undefined) {
  return n == null ? "—" : Math.round(n).toLocaleString();
}
function fmtMoneyN(n: number | null | undefined) {
  return n == null ? "—" : `$${Math.round(n).toLocaleString()}`;
}

function HeadlineTiles({ m, pm }: { m: MetricsHeadline; pm: MetricsHeadline | null }) {
  const tiles: { label: string; key: keyof MetricsHeadline; fmt: (n: number) => string }[] = [
    { label: "Avg Total", key: "avg_total_attendance", fmt: (n) => Math.round(n).toLocaleString() },
    { label: "Avg Sanctuary", key: "avg_sanctuary", fmt: (n) => Math.round(n).toLocaleString() },
    { label: "Avg Kids", key: "avg_kids", fmt: (n) => Math.round(n).toLocaleString() },
    { label: "Avg Giving", key: "avg_weekly_giving", fmt: (n) => `$${Math.round(n).toLocaleString()}` },
    { label: "Avg CG", key: "avg_community_groups", fmt: (n) => Math.round(n).toLocaleString() },
    { label: "Prayer", key: "prayer_interactions", fmt: (n) => Math.round(n).toLocaleString() },
    { label: "First Step", key: "first_step_cards", fmt: (n) => Math.round(n).toLocaleString() },
    { label: "Next Step", key: "next_step_cards", fmt: (n) => Math.round(n).toLocaleString() },
    { label: "QR Scans", key: "qr_scans", fmt: (n) => Math.round(n).toLocaleString() },
    { label: "Volunteers", key: "volunteers_added", fmt: (n) => Math.round(n).toLocaleString() },
  ];
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
        Last {m.weeks} weeks {pm && <span className="text-muted-foreground/70 normal-case tracking-normal">· vs prior {pm.weeks}</span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {tiles.map((t) => {
          const val = m[t.key] as number | undefined;
          if (val == null) return null;
          const prevVal = pm?.[t.key] as number | undefined;
          let delta: number | null = null;
          if (typeof prevVal === "number" && prevVal > 0) {
            delta = ((val - prevVal) / prevVal) * 100;
          }
          return (
            <div key={String(t.key)} className="bg-surface rounded-md px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.label}</div>
              <div className="text-sm font-semibold tabular-nums">{t.fmt(val)}</div>
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

export function DueDatePicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
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
    // Use server fn so completion is mirrored to Google Tasks; otherwise the
    // pull-sync hook will flip completed back to false within a few minutes.
    await setActionItemCompleted({ data: { actionItemId: id, completed: true } });
  }
  async function reassign(id: string, assignee_id: string | null) {
    await supabase.from("action_items").update({ assignee_id }).eq("id", id);
    if (assignee_id) {
      try {
        const r: any = await autoPushIfEnabled({ data: { actionItemId: id } });
        if (r?.pushed) toast.success("Sent to assignee's Google Tasks");
      } catch {}
    }
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
                        <div className="text-sm flex items-center gap-1.5">
                          <span className="truncate">{a.title}</span>
                          <TaskSourceButton actionItemId={a.id} />
                        </div>
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

const ATTENTION_SUB_CALS = [
  { value: "forest_hills_main", label: "Forest Hills Main" },
  { value: "coah_lm", label: "COAH:LM" },
  { value: "youth", label: "Youth" },
  { value: "general", label: "General" },
];
const ATTENTION_CATEGORIES = [
  "Holiday", "Leadership", "Women", "Men", "Class", "Social",
  "Kids/Youth", "Liturgical", "Meeting", "Church Plant",
  "Community Group", "Love DOT", "Prayer", "Core Team", "Other",
];

type AttentionAlert = {
  id: string;
  title: string;
  date: Date;
  gaps: string[];
  leader_name: string | null;
  leader_not_needed: boolean;
  childcare_needed: boolean;
  childcare_arranged: boolean;
  sub_calendar: string;
  category: string | null;
};

export function ClassesNeedingAttentionSection() {
  const [alerts, setAlerts] = useState<AttentionAlert[]>([]);
  const [tick, setTick] = useState(0);
  const [subFilters, setSubFilters] = useState<Record<string, boolean>>(
    Object.fromEntries(ATTENTION_SUB_CALS.map((s) => [s.value, true])),
  );
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  useEffect(() => {
    const horizonEnd = new Date(Date.now() + 28 * 86400000);
    supabase
      .from("calendar_events")
      .select("id,title,start_at,end_at,sub_calendar,leader_name,category,all_day,rrule,excluded_dates,leader_not_needed,childcare_needed,childcare_arranged")
      .or(`start_at.gte.${new Date().toISOString()},rrule.not.is.null`)
      .then(({ data }) => {
        const rows = (data ?? []) as Array<EventRowLike & { leader_not_needed: boolean; childcare_needed: boolean; childcare_arranged: boolean; category: string | null }>;
        const occurrences = expandEvents(rows, new Date(), horizonEnd);
        const list: AttentionAlert[] = occurrences
          .map((o) => {
            const gaps: string[] = [];
            const leaderNotNeeded = (o as { leader_not_needed?: boolean }).leader_not_needed ?? false;
            if (!leaderNotNeeded && !o.leader_name) gaps.push("leader");
            const needsCc = (o as { childcare_needed?: boolean }).childcare_needed ?? false;
            const arranged = (o as { childcare_arranged?: boolean }).childcare_arranged ?? false;
            if (needsCc && !arranged) gaps.push("childcare arrangement");
            return {
              id: o.id,
              title: o.title,
              date: o.occurrence_date,
              gaps,
              leader_name: o.leader_name ?? null,
              leader_not_needed: leaderNotNeeded,
              childcare_needed: needsCc,
              childcare_arranged: arranged,
              sub_calendar: o.sub_calendar,
              category: (o as { category?: string | null }).category ?? null,
            };
          })
          .filter((a) => a.gaps.length > 0)
          .sort((a, b) => a.date.getTime() - b.date.getTime());
        setAlerts(list);
      });
  }, [tick]);

  const visible = useMemo(
    () =>
      alerts.filter((a) => {
        if (!subFilters[a.sub_calendar]) return false;
        if (categoryFilter !== "all" && a.category !== categoryFilter) return false;
        return true;
      }),
    [alerts, subFilters, categoryFilter],
  );

  return (
    <StandingSection
      title="Events Needing Attention"
      subtitle="Upcoming events (next 4 weeks) missing a leader or with unarranged childcare."
      badge={
        visible.length > 0 ? (
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-warning/20 text-warning font-semibold">
            {visible.length}
          </span>
        ) : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-8 w-[10rem] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {ATTENTION_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        {ATTENTION_SUB_CALS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setSubFilters({ ...subFilters, [s.value]: !subFilters[s.value] })}
            className={`text-xs px-3 py-1.5 rounded-full border transition ${
              subFilters[s.value]
                ? "bg-surface border-border"
                : "bg-transparent border-border/50 text-muted-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">All upcoming events are squared away. 🎉</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((a) => (
            <li key={`${a.id}-${a.date.toISOString()}`} className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium truncate">{a.title}</div>
                <InlineClassFixer
                  event={{
                    id: a.id,
                    title: a.title,
                    leader_name: a.leader_name,
                    leader_not_needed: a.leader_not_needed,
                    childcare_needed: a.childcare_needed,
                    childcare_arranged: a.childcare_arranged,
                  }}
                  gaps={a.gaps}
                  onSaved={() => setTick((t) => t + 1)}
                />
              </div>
              <div className="text-xs text-muted-foreground shrink-0">{format(a.date, "EEE, MMM d")}</div>
            </li>
          ))}
        </ul>
      )}
    </StandingSection>
  );
}


