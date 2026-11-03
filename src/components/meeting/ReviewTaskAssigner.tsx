import { useEffect, useState } from "react";
import { format, addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { autoPushIfEnabled } from "@/lib/google-tasks.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export type ReviewTaskItem = { reviewId: string; text: string; submitter: string };
type Kind = "thank" | "followup";

/** Marker stored in action_items.notes so we can show which responses were assigned. */
export function reviewTaskMarker(kind: Kind, reviewId: string) {
  return `[sunday-review:${kind}:${reviewId}]`;
}

export function ReviewTaskAssigner({
  meetingId, kind, items, names,
}: {
  meetingId: string;
  kind: Kind;
  items: ReviewTaskItem[];
  names: Record<string, string>;
}) {
  const { user } = useAuth();
  const [selected, setSelected] = useState<string[]>([]);
  const [assigned, setAssigned] = useState<Record<string, string | null>>({});
  const [dialog, setDialog] = useState<{ item: ReviewTaskItem; assigneeId: string } | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadAssigned() {
    const { data } = await supabase
      .from("action_items")
      .select("assignee_id,notes")
      .eq("meeting_id", meetingId)
      .ilike("notes", `%[sunday-review:${kind}:%`);
    const map: Record<string, string | null> = {};
    (data ?? []).forEach((a: any) => {
      const m = String(a.notes ?? "").match(new RegExp(`\\[sunday-review:${kind}:([^\\]]+)\\]`));
      if (m) map[m[1]] = a.assignee_id;
    });
    setAssigned(map);
  }
  useEffect(() => { loadAssigned(); }, [meetingId, kind]);

  if (items.length === 0) return null;
  const label = kind === "thank" ? "Assign thank-yous" : "Assign follow-ups";
  const staff = Object.entries(names).sort((a, b) => a[1].localeCompare(b[1]));

  function openDialog(item: ReviewTaskItem, assigneeId: string) {
    const short = item.text.length > 80 ? item.text.slice(0, 77) + "…" : item.text;
    setTitle(kind === "thank" ? `Send thank you: ${short}` : `Follow up: ${short}`);
    setDue(format(addDays(new Date(), 3), "yyyy-MM-dd"));
    setDialog({ item, assigneeId });
  }

  async function create() {
    if (!dialog || !title.trim()) return;
    setSaving(true);
    const { item, assigneeId } = dialog;
    const notes = `${kind === "thank" ? "Thank-you" : "Follow-up"} from Sunday Review (submitted by ${item.submitter}):\n${item.text}\n\n${reviewTaskMarker(kind, item.reviewId)}`;
    const { data, error } = await supabase
      .from("action_items")
      .insert({
        meeting_id: meetingId, title: title.trim(), notes,
        assignee_id: assigneeId, due_date: due || null, created_by: user?.id ?? null,
      })
      .select("id")
      .single();
    setSaving(false);
    if (error) { toast.error(`Couldn't create task: ${error.message}`); return; }
    toast.success(`Task assigned to ${names[assigneeId] ?? "staff member"}`);
    try {
      const r: any = await autoPushIfEnabled({ data: { actionItemId: data.id } });
      if (r?.pushed) toast.success("Sent to assignee's Google Tasks");
    } catch {}
    setSelected((s) => s.filter((id) => id !== item.reviewId));
    setDialog(null);
    loadAssigned();
  }

  return (
    <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            {label}{selected.length ? ` (${selected.length} selected)` : ""}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 max-h-80 overflow-auto" align="start">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-muted-foreground">Select responses</span>
            <button
              className="text-xs underline"
              onClick={() => setSelected(selected.length === items.length ? [] : items.map((i) => i.reviewId))}
            >
              {selected.length === items.length ? "Clear" : "Select all"}
            </button>
          </div>
          <div className="space-y-2">
            {items.map((i) => (
              <label key={i.reviewId} className="flex gap-2 text-sm items-start cursor-pointer">
                <Checkbox
                  checked={selected.includes(i.reviewId)}
                  onCheckedChange={(v) =>
                    setSelected((s) => (v ? [...s, i.reviewId] : s.filter((x) => x !== i.reviewId)))
                  }
                />
                <span>
                  {i.text}
                  <span className="text-xs text-muted-foreground"> — {i.submitter}</span>
                  {assigned[i.reviewId] !== undefined && (
                    <span className="ml-1 text-xs text-primary">✓ Assigned</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {items.filter((i) => selected.includes(i.reviewId)).map((i) => (
        <div key={i.reviewId} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="flex-1 min-w-[10rem] truncate">{i.text}</span>
          <Select value="" onValueChange={(v) => openDialog(i, v)}>
            <SelectTrigger className="h-8 w-48"><SelectValue placeholder="Assign to…" /></SelectTrigger>
            <SelectContent>
              {staff.map(([id, n]) => <SelectItem key={id} value={id}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ))}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign task to {dialog ? names[dialog.assigneeId] : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{dialog?.item.text}</p>
            <div className="space-y-1">
              <Label>Task</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Due date</Label>
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={create} disabled={saving || !title.trim()}>
              {saving ? "Creating…" : "Create task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Small badge shown next to a response in the review list once assigned. */
export function useAssignedBadges() { return null; }
