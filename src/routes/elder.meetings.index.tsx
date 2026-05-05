import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { listElderMeetings, createElderMeeting } from "@/server/elder.functions";

export const Route = createFileRoute("/elder/meetings/")({
  component: ElderMeetingsList,
});

function ElderMeetingsList() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [type, setType] = useState<"standard" | "joint">("standard");
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setRows(await listElderMeetings() as any[]);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await createElderMeeting({ data: { meeting_date: date, meeting_type: type, title: title || undefined } });
      toast.success("Meeting created");
      setOpen(false);
      setTitle("");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-display font-semibold">Meetings</h2>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> New meeting
        </Button>
      </div>

      <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
        {loading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
        {!loading && rows.length === 0 && <div className="p-6 text-sm text-muted-foreground">No meetings yet.</div>}
        {rows.map((m) => (
          <Link
            key={m.id}
            to="/elder/meetings/$meetingId"
            params={{ meetingId: m.id }}
            className="flex items-center justify-between px-4 py-3 hover:bg-background/40"
          >
            <div>
              <div className="text-sm font-medium">{m.title ?? "Elder Meeting"}</div>
              <div className="text-xs text-muted-foreground">{format(new Date(m.meeting_date), "EEEE, MMM d, yyyy")}</div>
            </div>
            <div className="flex items-center gap-2">
              {m.meeting_type === "joint" && (
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[oklch(0.55_0.15_280)]/15 text-[oklch(0.55_0.15_280)]">
                  Joint
                </span>
              )}
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground">
                {m.status}
              </span>
            </div>
          </Link>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New elder meeting</DialogTitle>
            <DialogDescription>Schedule a new standard or joint elder meeting.</DialogDescription>
          </DialogHeader>
          <form onSubmit={create} className="space-y-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard Elder Meeting</SelectItem>
                  <SelectItem value="joint">Joint Elder/Deacon Meeting</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Title (optional)</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Auto-generated if empty" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={creating}>{creating ? "Creating…" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
