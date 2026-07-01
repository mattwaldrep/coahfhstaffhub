import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CalendarClock, Check, MessageSquare, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { logServeLeaderTouchpoint } from "@/lib/serve-leaders.functions";

type Person = { id: string; name: string; phone?: string | null };
type Meta = { last: string | null; count: number };

const FROM_FULL_NAME = "Matt Waldrep";

export function buildMonthlyCheckInMessage(firstName: string, fromFullName = FROM_FULL_NAME) {
  return `Hey ${firstName},

Hope you're doing well this week. Just wanted to check in and see how you're doing and how things are going with the serve team you lead. No pressure to write a novel—just reply with whatever's helpful!

Here are a few quick prompts to guide your thoughts:

How's your team doing? Any challenges, wins, or changes in the last few weeks?
How are you doing? Anything I can pray for or support you in personally?
Anything you need from me right now? (resources, encouragement, problem-solving, etc.)

If anything comes up that's better discussed in person or on a quick call, let's make that happen!
Grateful for you and how you lead faithfully.

Grace & peace,
${fromFullName}`;
}

function buildSmsHref(phone: string, body: string) {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIos = /iPhone|iPad|iPod|Mac/.test(ua);
  const sep = isIos ? "&" : "?";
  return `sms:${phone}${sep}body=${encodeURIComponent(body)}`;
}

/**
 * Returns people who have NOT been texted so far this calendar month.
 * A leader is "done" for the month if there's an outbound text logged with
 * created_at >= start of the current month.
 */
export function useMonthlyQueue(people: Person[], meta: Record<string, Meta>) {
  return useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const pending = people.filter((p) => {
      const last = meta[p.id]?.last;
      if (!last) return true;
      return new Date(last).getTime() < monthStart.getTime();
    });
    return pending;
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

  const queue = useMemo(() => pending.filter((p) => !skipped.has(p.id)), [pending, skipped]);
  const current = queue[idx] ?? queue[0];

  const firstName = current ? current.name.split(/\s+/)[0] ?? current.name : "";
  const [body, setBody] = useState(() => buildMonthlyCheckInMessage(firstName));
  const [sending, setSending] = useState(false);

  // Rebuild body when the current person changes
  useMemo(() => {
    if (current) setBody(buildMonthlyCheckInMessage(current.name.split(/\s+/)[0] ?? current.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

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
    // idx stays; queue shrinks by one so idx now points to next person
    if (idx >= queue.length - 1) {
      // last one — close if nothing remains after skip
      if (queue.length - 1 === 0) onOpenChange(false);
      else setIdx(Math.max(0, queue.length - 2));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-[oklch(0.55_0.15_280)]" />
            Monthly check-ins — {format(new Date(), "MMMM yyyy")}
          </DialogTitle>
        </DialogHeader>

        {queue.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <Check className="w-8 h-8 mx-auto text-success" />
            <div className="text-sm font-medium">All caught up for this month 🎉</div>
            <div className="text-xs text-muted-foreground">
              Every serve team leader has been texted since {format(new Date(new Date().setDate(1)), "MMM d")}.
            </div>
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
            <div className="text-[11px] text-muted-foreground text-right">
              {body.length} / 2000
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
