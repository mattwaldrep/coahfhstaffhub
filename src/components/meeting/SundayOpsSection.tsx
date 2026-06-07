import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, MessageSquare, CheckCircle2, ExternalLink, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { StandingSection } from "@/components/meeting/MeetingSections";
import {
  getSundayOpsForDate,
  importIssueAsTask,
  type SundayOpsFeedback,
} from "@/lib/sunday-ops.functions";

type Issue = {
  id: string;
  created_at: string;
  occurred_on: string | null;
  resource_category: string | null;
  description: string | null;
  severity: string | null;
  reporter_name: string | null;
  image_url: string | null;
  alreadyImported?: boolean;
};

function lastSundayOnOrBefore(dateStr: string): string {
  const d = new Date(dateStr + "T12:00");
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

function severityTone(sev: string | null) {
  const s = (sev ?? "").toLowerCase();
  if (s.includes("high") || s.includes("critical") || s.includes("urgent"))
    return "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30";
  if (s.includes("med")) return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
  if (s) return "bg-muted text-muted-foreground border-border";
  return "bg-muted text-muted-foreground border-border";
}

export function SundayOpsSection({ meetingDate }: { meetingId: string; meetingDate: string }) {
  const serviceDate = useMemo(() => lastSundayOnOrBefore(meetingDate), [meetingDate]);
  const fetchData = useServerFn(getSundayOpsForDate);
  const importTask = useServerFn(importIssueAsTask);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<SundayOpsFeedback[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [importing, setImporting] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchData({ data: { serviceDate } });
      setSubmissions(res.submissions);
      setIssues(res.issues as Issue[]);
      setError(res.error);
    } catch (e: any) {
      setError(e.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceDate]);

  const handleImport = async (issue: Issue) => {
    setImporting((s) => new Set(s).add(issue.id));
    try {
      const title = (issue.description ?? "Reported problem").slice(0, 140);
      const notesParts: string[] = [];
      if (issue.description && issue.description.length > 140) notesParts.push(issue.description);
      if (issue.severity) notesParts.push(`Severity: ${issue.severity}`);
      if (issue.resource_category) notesParts.push(`Area: ${issue.resource_category}`);
      if (issue.reporter_name) notesParts.push(`Reported by: ${issue.reporter_name}`);
      if (issue.occurred_on) notesParts.push(`Occurred: ${issue.occurred_on}`);
      if (issue.image_url) notesParts.push(`Photo: ${issue.image_url}`);
      const res = await importTask({
        data: {
          issueId: issue.id,
          title,
          notes: notesParts.join("\n") || undefined,
          occurredOn: issue.occurred_on ?? undefined,
        },
      });
      if (res.alreadyImported) {
        toast.info("Already imported");
      } else if (res.pushed) {
        toast.success("Task created and pushed to Google Tasks");
      } else {
        toast.success(`Task created${res.pushError ? ` (Google Tasks: ${res.pushError})` : ""}`);
      }
      setIssues((prev) => prev.map((i) => (i.id === issue.id ? { ...i, alreadyImported: true } : i)));
    } catch (e: any) {
      toast.error(e.message ?? "Failed to import");
    } finally {
      setImporting((s) => {
        const n = new Set(s);
        n.delete(issue.id);
        return n;
      });
    }
  };

  return (
    <StandingSection
      title="Sunday Ops — Volunteer Feedback & Problem Reports"
      subtitle={`From Sunday Ops for ${format(new Date(serviceDate + "T12:00"), "EEE, MMM d")}`}
      badge={
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">
          {submissions.length} feedback · {issues.length} {issues.length === 1 ? "issue" : "issues"}
        </span>
      }
    >
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading from Sunday Ops…
        </div>
      ) : error ? (
        <div className="text-sm text-rose-600 dark:text-rose-400 py-2">
          Couldn't load Sunday Ops data: {error}{" "}
          <Button variant="ghost" size="sm" onClick={load}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Problem reports */}
          <div>
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Problem Reports
            </h3>
            {issues.length === 0 ? (
              <div className="text-sm text-muted-foreground italic">No reports for this Sunday.</div>
            ) : (
              <ul className="space-y-2">
                {issues.map((i) => (
                  <li key={i.id} className="border border-border rounded-lg p-3 bg-background/40">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {i.severity && (
                            <span className={`text-[10px] uppercase tracking-wider border rounded px-1.5 py-0.5 ${severityTone(i.severity)}`}>
                              {i.severity}
                            </span>
                          )}
                          {i.resource_category && (
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              {i.resource_category}
                            </span>
                          )}
                          {i.reporter_name && (
                            <span className="text-xs text-muted-foreground">— {i.reporter_name}</span>
                          )}
                        </div>
                        <div className="text-sm whitespace-pre-wrap">{i.description ?? "(no description)"}</div>
                        {i.image_url && (
                          <a
                            href={i.image_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary inline-flex items-center gap-1 mt-1"
                          >
                            <ExternalLink className="w-3 h-3" /> View photo
                          </a>
                        )}
                      </div>
                      <div className="shrink-0">
                        {i.alreadyImported ? (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> In tasks
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleImport(i)}
                            disabled={importing.has(i.id)}
                          >
                            {importing.has(i.id) && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                            Make a task
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Volunteer feedback */}
          <div>
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              Volunteer Feedback
            </h3>
            {submissions.length === 0 ? (
              <div className="text-sm text-muted-foreground italic">No feedback submitted for this Sunday.</div>
            ) : (
              <ul className="space-y-2">
                {submissions.map((s) => (
                  <FeedbackRow key={s.id} sub={s} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </StandingSection>
  );
}

function FeedbackRow({ sub }: { sub: SundayOpsFeedback }) {
  const [open, setOpen] = useState(false);
  const items: any[] = Array.isArray(sub.checked_items) ? sub.checked_items : [];
  return (
    <li className="border border-border rounded-lg bg-background/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 p-3 text-left"
      >
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">
            {sub.resource_title ?? "Volunteer feedback"}
          </div>
          <div className="text-xs text-muted-foreground">
            {sub.resource_category ? `${sub.resource_category} · ` : ""}
            {sub.submission_date ?? sub.created_at?.slice(0, 10)}
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 text-sm">
          {items.length === 0 ? (
            <div className="text-muted-foreground italic">No answers.</div>
          ) : (
            items.map((it, idx) => <AnswerRow key={idx} item={it} />)
          )}
        </div>
      )}
    </li>
  );
}

function AnswerRow({ item }: { item: any }) {
  const label = item?.label ?? item?.question ?? "Answer";
  const type = item?.type ?? "";
  const value = item?.value;
  return (
    <div className="border-t border-border pt-2 first:border-t-0 first:pt-0">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5">
        {renderValue(type, value, item)}
      </div>
    </div>
  );
}

function renderValue(type: string, value: any, item: any): React.ReactNode {
  if (value == null || value === "") return <span className="text-muted-foreground italic">—</span>;
  if (Array.isArray(value)) {
    return (
      <ul className="list-disc list-inside">
        {value.map((v, i) => (
          <li key={i}>{typeof v === "object" ? JSON.stringify(v) : String(v)}</li>
        ))}
      </ul>
    );
  }
  if (type === "table" && item?.rows && item?.columns) {
    return (
      <div className="overflow-x-auto">
        <table className="text-xs border border-border rounded">
          <thead>
            <tr>
              {item.columns.map((c: any, i: number) => (
                <th key={i} className="px-2 py-1 text-left border-b border-border bg-muted/40">
                  {typeof c === "string" ? c : c?.label ?? ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {item.rows.map((row: any, i: number) => (
              <tr key={i}>
                {(Array.isArray(row) ? row : Object.values(row)).map((cell: any, j: number) => (
                  <td key={j} className="px-2 py-1 border-b border-border">
                    {typeof cell === "object" ? JSON.stringify(cell) : String(cell ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (typeof value === "object") return <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>;
  return <span className="whitespace-pre-wrap">{String(value)}</span>;
}
