import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  ArrowLeft,
  Upload,
  FileText,
  Plus,
  Trash2,
  Send,
  ExternalLink,
  CheckCircle2,
  Link as LinkIcon,
} from "lucide-react";
import {
  getSubmission,
  listRoughLines,
  addRoughLine,
  updateRoughLine,
  deleteRoughLine,
  submitRough,
  markSheetSubmitted,
  submitFeedback,
  updateSubmission,
  getOrCreateHighLevelPlan,
  updateHighLevelPlan,
  getSpendingReportUploadUrl,
  getSpendingReportDownloadUrl,
  finalizeReportUpload,
  postSheetLink,
} from "@/lib/annual-budget.functions";
import { useAuth } from "@/lib/auth-context";
import { format } from "date-fns";

export const Route = createFileRoute("/annual-planning/budget/$submissionId")({
  head: () => ({ meta: [{ title: "Budget Submission" }] }),
  component: SubmissionDetail,
});

function Section({
  step,
  title,
  status,
  children,
}: {
  step: number;
  title: string;
  status?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 text-primary h-8 w-8 grid place-items-center font-semibold text-sm">
              {step}
            </div>
            <h2 className="text-lg font-semibold">{title}</h2>
          </div>
          {status && <Badge variant="outline">{status}</Badge>}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function SubmissionDetail() {
  const { submissionId } = Route.useParams();
  const { hasRole, user } = useAuth();
  const isCore = hasRole("core");
  const navigate = useNavigate();
  const qc = useQueryClient();

  const getSub = useServerFn(getSubmission);
  const listLines = useServerFn(listRoughLines);
  const addLine = useServerFn(addRoughLine);
  const updLine = useServerFn(updateRoughLine);
  const delLine = useServerFn(deleteRoughLine);
  const submitR = useServerFn(submitRough);
  const markSheet = useServerFn(markSheetSubmitted);
  const submitFb = useServerFn(submitFeedback);
  const updSub = useServerFn(updateSubmission);
  const getHLP = useServerFn(getOrCreateHighLevelPlan);
  const updHLP = useServerFn(updateHighLevelPlan);
  const getUploadUrl = useServerFn(getSpendingReportUploadUrl);
  const getDownloadUrl = useServerFn(getSpendingReportDownloadUrl);
  const finalize = useServerFn(finalizeReportUpload);
  const postLink = useServerFn(postSheetLink);

  const { data: sub, isLoading } = useQuery({
    queryKey: ["budget-submission", submissionId],
    queryFn: () => getSub({ data: { submissionId } }),
  });

  const { data: lines = [] } = useQuery({
    queryKey: ["budget-lines", submissionId],
    queryFn: () => listLines({ data: { submissionId } }),
    enabled: !!sub,
  });

  const { data: hlp } = useQuery({
    queryKey: ["budget-hlp", submissionId],
    queryFn: () => getHLP({ data: { submissionId } }),
    enabled: !!sub,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["budget-submission", submissionId] });
    qc.invalidateQueries({ queryKey: ["budget-lines", submissionId] });
    qc.invalidateQueries({ queryKey: ["budget-hlp", submissionId] });
    qc.invalidateQueries({ queryKey: ["budget-submissions"] });
  };

  const [sheetUrlInput, setSheetUrlInput] = useState("");
  const [feedbackInput, setFeedbackInput] = useState("");
  useEffect(() => {
    if (sub?.sheet_url && !sheetUrlInput) setSheetUrlInput(sub.sheet_url);
    if (sub?.feedback_body && !feedbackInput) setFeedbackInput(sub.feedback_body);
  }, [sub]);

  const isOwner = !!user && sub?.user_id === user.id;
  const canView = isCore || isOwner;
  useEffect(() => {
    if (sub && !canView) navigate({ to: "/annual-planning/budget" });
  }, [sub, canView]);

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + Number(l.amount_annual || 0), 0),
    [lines],
  );

  if (isLoading || !sub) {
    return (
      <AppShell>
        <div className="max-w-4xl mx-auto p-6 text-sm text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }

  // ---- Handlers ----
  async function handleUploadReport(file: File) {
    try {
      const { path, signedUrl, token } = await getUploadUrl({
        data: { submissionId, filename: file.name },
      });
      const res = await fetch(signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          Authorization: `Bearer ${token}`,
          "x-upsert": "true",
        },
        body: file,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      await finalize({ data: { submissionId, path } });
      toast.success("Spending report uploaded — leader notified");
      invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    }
  }

  async function handleDownloadReport() {
    const { url } = await getDownloadUrl({ data: { submissionId } });
    if (url) window.open(url, "_blank");
    else toast.error("No report uploaded yet");
  }

  const roughLocked = sub.rough_status === "submitted" && !isCore;

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/annual-planning/budget">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to Annual Budget
            </Link>
          </Button>
          <h1 className="text-2xl font-display font-bold">
            {sub.ministry_area}
            <span className="text-muted-foreground text-base font-normal ml-2">
              FY {(sub as any).fiscal_year}
            </span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {sub.author_name ?? "—"}
            {sub.rough_due_date && (
              <> · Rough due {format(new Date(sub.rough_due_date + "T00:00:00"), "MMM d")}</>
            )}
          </p>
        </div>

        {/* Step 1: Spending report */}
        <Section
          step={1}
          title="12-month spending report (Feb – Feb)"
          status={sub.spending_report_uploaded_at ? "Uploaded" : "Pending"}
        >
          {sub.spending_report_uploaded_at ? (
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Uploaded {format(new Date(sub.spending_report_uploaded_at), "MMM d, yyyy")}
              </div>
              <Button variant="outline" size="sm" onClick={handleDownloadReport}>
                <ExternalLink className="h-4 w-4 mr-1" /> Download
              </Button>
            </div>
          ) : isCore ? (
            <div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Button variant="outline" size="sm" asChild>
                  <span>
                    <Upload className="h-4 w-4 mr-1" /> Upload PDF/CSV
                  </span>
                </Button>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.csv,.xlsx,.xls"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUploadReport(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <p className="text-xs text-muted-foreground mt-2">
                Uploading notifies the leader and kicks off their rough budget + 10k-ft plan.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Waiting on the office to upload your Feb–Feb spending report.
            </p>
          )}
        </Section>

        {/* Step 2: Rough budget lines */}
        <Section
          step={2}
          title="Rough budget request"
          status={
            sub.rough_status === "submitted"
              ? "Submitted"
              : sub.rough_status === "in_progress"
                ? "In progress"
                : "Not started"
          }
        >
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="w-40">Annual $</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      <Input
                        defaultValue={line.category_name}
                        disabled={roughLocked}
                        onBlur={async (e) => {
                          if (e.target.value === line.category_name) return;
                          await updLine({
                            data: { lineId: line.id, patch: { category_name: e.target.value } },
                          });
                          invalidate();
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        defaultValue={line.amount_annual}
                        disabled={roughLocked}
                        onBlur={async (e) => {
                          const v = Number(e.target.value || 0);
                          if (v === Number(line.amount_annual)) return;
                          await updLine({
                            data: { lineId: line.id, patch: { amount_annual: v } },
                          });
                          invalidate();
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        defaultValue={line.note ?? ""}
                        disabled={roughLocked}
                        onBlur={async (e) => {
                          if ((e.target.value || "") === (line.note ?? "")) return;
                          await updLine({
                            data: { lineId: line.id, patch: { note: e.target.value || null } },
                          });
                          invalidate();
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={roughLocked}
                        onClick={async () => {
                          await delLine({ data: { lineId: line.id } });
                          invalidate();
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {lines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-4">
                      No line items yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={roughLocked}
              onClick={async () => {
                await addLine({
                  data: {
                    submissionId,
                    line: { category_name: "New category", amount_annual: 0, sort_order: lines.length },
                  },
                });
                if (sub.rough_status === "not_started") {
                  await updSub({ data: { submissionId, patch: { rough_status: "in_progress" } } });
                }
                invalidate();
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Add line
            </Button>
            <div className="text-sm">
              <span className="text-muted-foreground mr-2">Total:</span>
              <span className="font-semibold">
                ${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
          {sub.rough_status !== "submitted" && (
            <div className="pt-2 border-t">
              <Button
                size="sm"
                disabled={lines.length === 0}
                onClick={async () => {
                  await submitR({ data: { submissionId } });
                  toast.success("Rough budget submitted");
                  invalidate();
                }}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" /> Submit rough budget
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Also make sure your 10,000-ft plan below is complete before March 31.
              </p>
            </div>
          )}
          {sub.rough_status === "submitted" && sub.rough_submitted_at && (
            <p className="text-xs text-muted-foreground">
              Submitted {format(new Date(sub.rough_submitted_at), "MMM d, yyyy")}
            </p>
          )}
        </Section>

        {/* Step 3: 10k-ft plan */}
        <Section step={3} title="10,000-ft plan" status={hlp?.carried_to_map_id ? "Carried to MAP" : undefined}>
          {!hlp ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <HighLevelPlanEditor
              hlp={hlp}
              disabled={!!hlp.carried_to_map_id && !isCore}
              onSave={async (patch) => {
                await updHLP({ data: { planId: hlp.id, patch } });
                invalidate();
              }}
            />
          )}
          <p className="text-xs text-muted-foreground">
            This is a lightweight version of the Ministry Action Plan. When you build your full MAP
            later, these answers will be pre-filled so you can flesh them out.
          </p>
        </Section>

        {/* Step 4: Google sheet + submission */}
        <Section
          step={4}
          title="Detailed Google Sheet budget"
          status={
            sub.sheet_status === "awaiting_link"
              ? "Awaiting link"
              : sub.sheet_status === "in_progress"
                ? "In progress"
                : sub.sheet_status === "submitted"
                  ? "Submitted"
                  : sub.sheet_status === "feedback_provided"
                    ? "Feedback sent"
                    : "Revised"
          }
        >
          {isCore ? (
            <div className="space-y-2">
              <Label>Google Sheet link (posted to leader)</Label>
              <div className="flex gap-2">
                <Input
                  value={sheetUrlInput}
                  onChange={(e) => setSheetUrlInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/..."
                />
                <Button
                  size="sm"
                  disabled={!sheetUrlInput || sheetUrlInput === sub.sheet_url}
                  onClick={async () => {
                    await postLink({ data: { submissionId, sheetUrl: sheetUrlInput } });
                    toast.success("Sheet link posted — leader notified");
                    invalidate();
                  }}
                >
                  <LinkIcon className="h-4 w-4 mr-1" /> {sub.sheet_url ? "Update" : "Post"}
                </Button>
              </div>
            </div>
          ) : sub.sheet_url ? (
            <div className="flex items-center justify-between gap-3">
              <a
                href={sub.sheet_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline break-all"
              >
                {sub.sheet_url}
              </a>
              <Button
                size="sm"
                variant={sub.sheet_status === "submitted" || sub.sheet_status === "revised" ? "outline" : "default"}
                onClick={async () => {
                  await markSheet({ data: { submissionId } });
                  toast.success("Marked as submitted — core notified");
                  invalidate();
                }}
              >
                <Send className="h-4 w-4 mr-1" />
                {sub.sheet_status === "feedback_provided" ? "Re-submit sheet" : "I've submitted my sheet"}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your budget sheet link will be posted here on/after April 1.
            </p>
          )}
          {sub.sheet_submitted_at && (
            <p className="text-xs text-muted-foreground">
              Last submitted {format(new Date(sub.sheet_submitted_at), "MMM d, yyyy h:mm a")}
            </p>
          )}
        </Section>

        {/* Step 5: Feedback */}
        <Section
          step={5}
          title="Feedback"
          status={sub.feedback_submitted_at ? "Sent" : "Pending"}
        >
          {isCore ? (
            <div className="space-y-2">
              <Textarea
                rows={6}
                value={feedbackInput}
                onChange={(e) => setFeedbackInput(e.target.value)}
                placeholder="Feedback for the ministry leader…"
              />
              <Button
                size="sm"
                disabled={!feedbackInput.trim()}
                onClick={async () => {
                  await submitFb({ data: { submissionId, feedback: feedbackInput } });
                  toast.success("Feedback sent to leader");
                  invalidate();
                }}
              >
                <Send className="h-4 w-4 mr-1" /> Send feedback
              </Button>
            </div>
          ) : sub.feedback_body ? (
            <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
              {sub.feedback_body}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No feedback yet — core will review your sheet and respond here.
            </p>
          )}
          {sub.feedback_submitted_at && (
            <p className="text-xs text-muted-foreground">
              Sent {format(new Date(sub.feedback_submitted_at), "MMM d, yyyy h:mm a")}
            </p>
          )}
        </Section>
      </div>
    </AppShell>
  );
}

// ---- 10k-ft plan editor ----

type HLP = {
  id: string;
  purpose: string;
  top_goals: { id: string; statement: string; why: string }[];
  swot_seeds: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  notes: string;
  carried_to_map_id: string | null;
};

function HighLevelPlanEditor({
  hlp,
  disabled,
  onSave,
}: {
  hlp: HLP;
  disabled: boolean;
  onSave: (patch: any) => Promise<void>;
}) {
  const [purpose, setPurpose] = useState(hlp.purpose ?? "");
  const [notes, setNotes] = useState(hlp.notes ?? "");
  const [goals, setGoals] = useState(hlp.top_goals ?? []);
  const [swot, setSwot] = useState(hlp.swot_seeds);

  useEffect(() => {
    setPurpose(hlp.purpose ?? "");
    setNotes(hlp.notes ?? "");
    setGoals(hlp.top_goals ?? []);
    setSwot(hlp.swot_seeds);
  }, [hlp.id]);

  const debouncedSave = (patch: any) => {
    onSave(patch);
  };

  function SwotList({ k, label }: { k: keyof HLP["swot_seeds"]; label: string }) {
    const items = swot[k] ?? [];
    return (
      <div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
        <div className="space-y-1 mt-1">
          {items.map((it, i) => (
            <div key={i} className="flex gap-2">
              <Input
                defaultValue={it}
                disabled={disabled}
                onBlur={(e) => {
                  const next = [...items];
                  next[i] = e.target.value;
                  const s2 = { ...swot, [k]: next };
                  setSwot(s2);
                  debouncedSave({ swot_seeds: s2 });
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                disabled={disabled}
                onClick={() => {
                  const next = items.filter((_, j) => j !== i);
                  const s2 = { ...swot, [k]: next };
                  setSwot(s2);
                  debouncedSave({ swot_seeds: s2 });
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => {
              const s2 = { ...swot, [k]: [...items, ""] };
              setSwot(s2);
              debouncedSave({ swot_seeds: s2 });
            }}
          >
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Ministry purpose (why this ministry exists)</Label>
        <Textarea
          rows={3}
          value={purpose}
          disabled={disabled}
          onChange={(e) => setPurpose(e.target.value)}
          onBlur={() => debouncedSave({ purpose })}
        />
      </div>

      <div>
        <Label>Top goals for the year (3–5)</Label>
        <div className="space-y-2 mt-1">
          {goals.map((g, i) => (
            <div key={g.id} className="rounded-md border p-2 space-y-2">
              <Input
                placeholder="Goal statement"
                defaultValue={g.statement}
                disabled={disabled}
                onBlur={(e) => {
                  const next = [...goals];
                  next[i] = { ...g, statement: e.target.value };
                  setGoals(next);
                  debouncedSave({ top_goals: next });
                }}
              />
              <Input
                placeholder="Why this matters"
                defaultValue={g.why}
                disabled={disabled}
                onBlur={(e) => {
                  const next = [...goals];
                  next[i] = { ...g, why: e.target.value };
                  setGoals(next);
                  debouncedSave({ top_goals: next });
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => {
                  const next = goals.filter((_, j) => j !== i);
                  setGoals(next);
                  debouncedSave({ top_goals: next });
                }}
              >
                <Trash2 className="h-3 w-3 mr-1" /> Remove
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || goals.length >= 6}
            onClick={() => {
              const next = [
                ...goals,
                { id: crypto.randomUUID(), statement: "", why: "" },
              ];
              setGoals(next);
              debouncedSave({ top_goals: next });
            }}
          >
            <Plus className="h-3 w-3 mr-1" /> Add goal
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <SwotList k="strengths" label="Strengths" />
        <SwotList k="weaknesses" label="Weaknesses" />
        <SwotList k="opportunities" label="Opportunities" />
        <SwotList k="threats" label="Threats" />
      </div>

      <div>
        <Label>Other notes</Label>
        <Textarea
          rows={3}
          value={notes}
          disabled={disabled}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => debouncedSave({ notes })}
        />
      </div>
    </div>
  );
}
