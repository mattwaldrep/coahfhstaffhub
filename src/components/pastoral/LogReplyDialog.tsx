import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { logTouchpoint as defaultLogTouchpoint } from "@/lib/pastoral-care.functions";

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function LogReplyDialog({
  open,
  onOpenChange,
  personId,
  personName,
  onLogged,
  logTouchpoint = defaultLogTouchpoint,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  personId: string;
  personName: string;
  onLogged?: () => void;
  logTouchpoint?: typeof defaultLogTouchpoint;
}) {
  const [body, setBody] = useState("");
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [receivedAt, setReceivedAt] = useState(toLocalInputValue(new Date()));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimmed = body.trim();
    if (!trimmed) {
      toast.error("Reply is empty");
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        pco_person_id: personId,
        person_name: personName,
        kind: "text",
        direction: "inbound",
        note: trimmed,
      };
      if (useCustomTime) {
        const d = new Date(receivedAt);
        if (!isNaN(d.getTime())) payload.created_at = d.toISOString();
      }
      await logTouchpoint({ data: payload });
      toast.success("Reply logged");
      setBody("");
      setUseCustomTime(false);
      setReceivedAt(toLocalInputValue(new Date()));
      onLogged?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to log reply");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Log {personName.split(/\s+/)[0]}'s reply</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder={`Paste or type what ${personName.split(/\s+/)[0]} sent back…`}
            autoFocus
            className="text-sm"
          />

          <div className="flex items-center gap-2 text-xs">
            <label className="inline-flex items-center gap-1.5 text-muted-foreground">
              <input
                type="checkbox"
                checked={useCustomTime}
                onChange={(e) => setUseCustomTime(e.target.checked)}
              />
              Set when received
            </label>
            {useCustomTime && (
              <Input
                type="datetime-local"
                value={receivedAt}
                onChange={(e) => setReceivedAt(e.target.value)}
                className="h-8 text-xs w-auto"
              />
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !body.trim()}>
              Save reply
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
