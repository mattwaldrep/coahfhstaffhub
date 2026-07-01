import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { logTouchpoint as defaultLogTouchpoint } from "@/lib/pastoral-care.functions";

const TEMPLATES: { label: string; build: (firstName: string) => string }[] = [
  { label: "Checking in", build: (n) => `Hey ${n}, just wanted to check in and see how you're doing this week. ` },
  { label: "Praying", build: (n) => `Hi ${n}, I've been praying for you. Anything specific I can lift up? ` },
  { label: "Visit", build: (n) => `Hi ${n}, would love to grab coffee or stop by sometime this week. What works? ` },
  { label: "Following up", build: (n) => `Hey ${n}, following up on our last conversation. ` },
];

function buildSmsHref(phone: string, body: string) {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIos = /iPhone|iPad|iPod|Mac/.test(ua);
  const sep = isIos ? "&" : "?";
  return `sms:${phone}${sep}body=${encodeURIComponent(body)}`;
}

export function TextComposerDialog({
  open,
  onOpenChange,
  personId,
  personName,
  phone,
  onSent,
  logTouchpoint = defaultLogTouchpoint,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  personId: string;
  personName: string;
  phone: string;
  onSent?: () => void;
  logTouchpoint?: typeof defaultLogTouchpoint;
}) {
  const firstName = personName.split(/\s+/)[0] ?? "";
  const [body, setBody] = useState(`Hey ${firstName}, `);
  const [sending, setSending] = useState(false);

  async function handleSend() {
    const trimmed = body.trim();
    if (!trimmed) {
      toast.error("Message is empty");
      return;
    }
    setSending(true);
    try {
      await logTouchpoint({
        data: {
          pco_person_id: personId,
          person_name: personName,
          kind: "text",
          direction: "outbound",
          note: trimmed,
        },
      });
      // Hand off to native Messages app
      window.location.href = buildSmsHref(phone, trimmed);
      onSent?.();
      onOpenChange(false);
      setBody(`Hey ${firstName}, `);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to log text");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Text {personName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Sending to <span className="font-mono">{phone}</span>. Your phone's Messages app will
            open with this message pre-filled — tap send there. We'll log it here automatically.
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground self-center">
              Templates
            </span>
            {TEMPLATES.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => setBody(t.build(firstName))}
                className="text-[11px] px-2 py-1 rounded-full border border-border bg-background text-muted-foreground hover:text-foreground"
              >
                {t.label}
              </button>
            ))}
          </div>

          <div>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              maxLength={1000}
              placeholder="Type your message…"
              autoFocus
              className="text-sm"
            />
            <div className="mt-1 text-[11px] text-muted-foreground text-right">
              {body.length} / 1000
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={sending}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSend} disabled={sending || !body.trim()}>
              Open in Messages →
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
