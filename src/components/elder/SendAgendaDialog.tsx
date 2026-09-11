import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listAgendaRecipients, sendElderAgenda } from "@/lib/elder-agenda.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Recipient = { id: string; name: string; email: string; role: string };

export function SendAgendaDialog({
  meetingId,
  open,
  onOpenChange,
}: {
  meetingId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listAgendaRecipients({ data: { meeting_id: meetingId } })
      .then((r: any) => setRecipients(r as Recipient[]))
      .catch((e: any) => toast.error(e?.message ?? "Could not load recipients"))
      .finally(() => setLoading(false));
  }, [open, meetingId]);

  const selected = recipients.filter((r) => !off[r.id]);

  async function send() {
    if (!selected.length) {
      toast.error("Pick at least one recipient");
      return;
    }
    setBusy(true);
    try {
      const res: any = await sendElderAgenda({
        data: {
          meeting_id: meetingId,
          note: note.trim() ? note.trim() : null,
          recipient_ids: selected.map((r) => r.id),
        },
      });
      if (res.failures?.length) {
        toast.warning(`Sent to ${res.sent}. Could not reach: ${res.failures.join(", ")}`);
      } else {
        toast.success(`Agenda sent to ${res.sent} ${res.sent === 1 ? "person" : "people"}`);
      }
      onOpenChange(false);
      setNote("");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not send the agenda");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send agenda</DialogTitle>
          <DialogDescription>
            Emails a clean PDF of the agenda. Executive Session items are never included.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="agenda-note">Note (optional)</Label>
            <Textarea
              id="agenda-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything you want them to read before the meeting…"
            />
          </div>

          <div className="space-y-2">
            <Label>Recipients ({selected.length})</Label>
            {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
            {!loading && recipients.length === 0 && (
              <div className="text-sm text-muted-foreground">
                No one has an email address on file yet.
              </div>
            )}
            <div className="max-h-56 overflow-y-auto rounded-xl border border-border divide-y divide-border">
              {recipients.map((r) => (
                <label key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={!off[r.id]}
                    onCheckedChange={(v) => setOff((p) => ({ ...p, [r.id]: v !== true }))}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{r.name}</span>
                    <span className="block text-xs text-muted-foreground truncate">{r.email}</span>
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
                    {r.role}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button onClick={send} disabled={busy || loading} className="rounded-xl font-bold">
              {busy ? "Sending…" : "Send agenda"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
