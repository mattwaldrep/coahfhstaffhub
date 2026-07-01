import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  CalendarClock, Check, MessageSquare, SkipForward, Pencil, RotateCcw, ChevronDown, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  logServeLeaderTouchpoint,
  resetServeLeaderMonthlyCheckIn,
} from "@/lib/serve-leaders.functions";

type Person = { id: string; name: string; phone?: string | null };
type Meta = { last: string | null; count: number };

const FROM_FULL_NAME = "Matt Waldrep";
const TEMPLATE_KEY = "serve_leader_checkin_template_v1";

const DEFAULT_TEMPLATE = `Hey {firstName},

Hope you're doing well this week. Just wanted to check in and see how you're doing and how things are going with the serve team you lead. No pressure to write a novel—just reply with whatever's helpful!

Here are a few quick prompts to guide your thoughts:

How's your team doing? Any challenges, wins, or changes in the last few weeks?
How are you doing? Anything I can pray for or support you in personally?
Anything you need from me right now? (resources, encouragement, problem-solving, etc.)

If anything comes up that's better discussed in person or on a quick call, let's make that happen!
Grateful for you and how you lead faithfully.

Grace & peace,
{fromName}`;

function loadTemplate(): string {
  if (typeof window === "undefined") return DEFAULT_TEMPLATE;
  return window.localStorage.getItem(TEMPLATE_KEY) || DEFAULT_TEMPLATE;
}

function saveTemplate(t: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TEMPLATE_KEY, t);
}

function render(template: string, firstName: string, fromName = FROM_FULL_NAME) {
  return template.replaceAll("{firstName}", firstName).replaceAll("{fromName}", fromName);
}

export function buildMonthlyCheckInMessage(firstName: string, fromFullName = FROM_FULL_NAME) {
  return render(loadTemplate(), firstName, fromFullName);
}

function buildSmsHref(phone: string, body: string) {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIos = /iPhone|iPad|iPod|Mac/.test(ua);
  const sep = isIos ? "&" : "?";
  return `sms:${phone}${sep}body=${encodeURIComponent(body)}`;
}

export function useMonthlyQueue(people: Person[], meta: Record<string, Meta>) {
  return useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    return people.filter((p) => {
      const last = meta[p.id]?.last;
      if (!last) return true;
      return new Date(last).getTime() < monthStart.getTime();
    });
  }, [people, meta]);
}

export function MonthlyCheckInDialog({
  open,
  onOpenChange,
  people,
  meta,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  people: Person[];
  meta: Record<string, Meta>;
  onChanged: () => void;
}) {
  const pending = useMonthlyQueue(people, meta);
  const [idx, setIdx] = useState(0);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [template, setTemplate] = useState<string>(() => loadTemplate());
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [showContacted, setShowContacted] = useState(false);

  const queue = useMemo(() => pending.filter((p) => !skipped.has(p.id)), [pending, skipped]);
  const current = queue[idx] ?? queue[0];

  const firstName = current ? current.name.split(/\s+/)[0] ?? current.name : "";
  const [body, setBody] = useState(() => render(template, firstName));
  const [sending, setSending] = useState(false);

  // Rebuild body when the current person or template changes
  useEffect(() => {
    if (current) setBody(render(template, current.name.split(/\s+/)[0] ?? current.name));
  }, [current?.id, template]);

  // Leaders already contacted this month (for reset/undo)
  const contactedThisMonth = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    return people
      .filter((p) => {
        const last = meta[p.id]?.last;
        return last && new Date(last).getTime() >= monthStart.getTime();
      })
      .sort((a, b) => {
        const la = new Date(meta[a.id]?.last ?? 0).getTime();
        const lb = new Date(meta[b.id]?.last ?? 0).getTime();
        return lb - la;
      });
  }, [people, meta]);

  function advance() {
    if (idx + 1 < queue.length) setIdx(idx + 1);
    else onOpenChange(false);
  }

  async function handleSend() {
    if (!current) return;
    if (!current.phone) {
      toast.error("No phone number on file in Planning Center");
      return;
    }
    const trimmed = body.trim();
    if (!trimmed) {
      toast.error("Message is empty");
      return;
    }
    setSending(true);
    try {
      await logServeLeaderTouchpoint({
        data: {
          pco_person_id: current.id,
          person_name: current.name,
          kind: "text",
          direction: "outbound",
          note: trimmed,
        },
      });
      window.location.href = buildSmsHref(current.phone, trimmed);
      onChanged();
      advance();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to log text");
    } finally {
      setSending(false);
    }
  }

  function handleSkip() {
    if (!current) return;
    const next = new Set(skipped);
    next.add(current.id);
    setSkipped(next);
    if (idx >= queue.length - 1) {
      if (queue.length - 1 === 0) onOpenChange(false);
      else setIdx(Math.max(0, queue.length - 2));
    }
  }

  async function handleReset(personId: string, personName: string) {
    if (!confirm(`Reset ${personName}'s check-in for this month? They'll re-appear in the queue.`)) return;
    try {
      await resetServeLeaderMonthlyCheckIn({ data: { pco_person_id: personId } });
      toast.success(`${personName.split(/\s+/)[0]}'s check-in reset`);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to reset");
    }
  }

  function handleSaveTemplate() {
    saveTemplate(template);
    setEditingTemplate(false);
    if (current) setBody(render(template, current.name.split(/\s+/)[0] ?? current.name));
    toast.success("Template saved");
  }

  function handleResetTemplate() {
    if (!confirm("Restore the default template?")) return;
    setTemplate(DEFAULT_TEMPLATE);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-[oklch(0.55_0.15_280)]" />
            Monthly check-ins — {format(new Date(), "MMMM yyyy")}
          </DialogTitle>
        </DialogHeader>

        {editingTemplate ? (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              Placeholders: <code className="px-1 rounded bg-background border border-border">{"{firstName}"}</code>{" "}
              <code className="px-1 rounded bg-background border border-border">{"{fromName}"}</code>
            </div>
            <Textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={16}
              className="text-sm font-mono"
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={handleResetTemplate}>
                Restore default
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setTemplate(loadTemplate()); setEditingTemplate(false); }}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveTemplate}>Save template</Button>
            </div>
          </div>
        ) : queue.length === 0 ? (
          <div className="space-y-4">
            <div className="py-6 text-center space-y-2">
              <Check className="w-8 h-8 mx-auto text-success" />
              <div className="text-sm font-medium">All caught up for this month 🎉</div>
              <div className="text-xs text-muted-foreground">
                Every serve team leader has been texted since {format(new Date(new Date().setDate(1)), "MMM d")}.
              </div>
            </div>
            <div className="flex justify-between items-center">
              <Button size="sm" variant="outline" onClick={() => setEditingTemplate(true)}>
                <Pencil className="w-3.5 h-3.5 mr-1" /> Edit template
              </Button>
            </div>
            <ContactedList
              contacted={contactedThisMonth}
              meta={meta}
              open={showContacted}
              onToggle={() => setShowContacted((v) => !v)}
              onReset={handleReset}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {idx + 1} of {queue.length} · {pending.length - queue.length} skipped
              </span>
              <span className="font-mono">{current?.phone ?? "no phone"}</span>
            </div>

            <div>
              <div className="text-sm font-medium">{current?.name}</div>
              <div className="text-xs text-muted-foreground">
                {meta[current?.id ?? ""]?.last
                  ? `Last contact ${format(new Date(meta[current!.id].last!), "MMM d, yyyy")}`
                  : "No check-in logged yet"}
              </div>
            </div>

            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              maxLength={2000}
              className="text-sm"
            />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <button
                type="button"
                onClick={() => setEditingTemplate(true)}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <Pencil className="w-3 h-3" /> Edit template
              </button>
              <span>{body.length} / 2000</span>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={sending}>
                Close
              </Button>
              <Button variant="outline" size="sm" onClick={handleSkip} disabled={sending}>
                <SkipForward className="w-3.5 h-3.5 mr-1" /> Skip
              </Button>
              <Button size="sm" onClick={handleSend} disabled={sending || !current?.phone}>
                <MessageSquare className="w-3.5 h-3.5 mr-1" />
                {current?.phone ? "Open in Messages →" : "No phone on file"}
              </Button>
            </div>

            <ContactedList
              contacted={contactedThisMonth}
              meta={meta}
              open={showContacted}
              onToggle={() => setShowContacted((v) => !v)}
              onReset={handleReset}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ContactedList({
  contacted, meta, open, onToggle, onReset,
}: {
  contacted: Person[];
  meta: Record<string, Meta>;
  open: boolean;
  onToggle: () => void;
  onReset: (personId: string, personName: string) => void;
}) {
  if (contacted.length === 0) return null;
  return (
    <div className="border-t border-border pt-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Already contacted this month ({contacted.length})
      </button>
      {open && (
        <div className="mt-2 space-y-1">
          {contacted.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between text-xs border border-border rounded px-2 py-1.5"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  Sent {meta[p.id]?.last ? format(new Date(meta[p.id].last!), "MMM d, h:mm a") : "—"}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => onReset(p.id, p.name)}
                title="Reset this month's check-in — re-adds them to the queue"
              >
                <RotateCcw className="w-3 h-3 mr-1" /> Reset
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
