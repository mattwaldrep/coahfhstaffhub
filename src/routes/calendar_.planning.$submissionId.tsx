import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { useServerFn } from "@tanstack/react-start";
import {
  getSubmission, addProposedEvent, updateProposedEvent,
  deleteProposedEvent, submitSubmission, deleteSubmission,
  listVisibleProposedEvents,
} from "@/server/calendar.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, ArrowLeft, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/calendar_/planning/$submissionId")({
  component: () => <AppShell><Editor /></AppShell>,
});

const emptyEvent = () => ({
  title: "", description: "", sub_calendar: "general",
  start_at: "", end_at: "", all_day: false, category: "",
  leader_name: "", location: "", room_needed: "",
  action_note: "", pco_registration: false,
  missions_team_needed: false, church_covering: "",
  other_listings: "" as string,
});

function Editor() {
  const { submissionId } = useParams({ from: "/calendar/planning/$submissionId" });
  const { user, hasRole } = useAuth();
  const isCore = hasRole("core");
  const fnGet = useServerFn(getSubmission);
  const fnAdd = useServerFn(addProposedEvent);
  const fnUpd = useServerFn(updateProposedEvent);
  const fnDel = useServerFn(deleteProposedEvent);
  const fnSubmit = useServerFn(submitSubmission);
  const fnDelSub = useServerFn(deleteSubmission);
  const fnVisible = useServerFn(listVisibleProposedEvents);

  const [submission, setSubmission] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [otherEvents, setOtherEvents] = useState<any[]>([]);
  const [masterEvents, setMasterEvents] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyEvent());

  const isOwner = submission?.leader_id === user?.id;
  const canEdit = isOwner && submission?.status === "draft";

  async function load() {
    const { submission, events } = await fnGet({ data: { id: submissionId } });
    setSubmission(submission);
    setEvents(events);
    if (submission?.cycle_id) {
      const vis = await fnVisible({ data: { cycle_id: submission.cycle_id } });
      setOtherEvents(vis.events.filter((e: any) => e.submission_id !== submissionId));
    }
    const { data: mast } = await supabase
      .from("calendar_events")
      .select("id, title, start_at, sub_calendar, room_needed, location")
      .order("start_at", { ascending: true });
    setMasterEvents(mast ?? []);
  }
  useEffect(() => { load(); }, [submissionId]);

  function openNew() {
    setEditId(null);
    setForm({ ...emptyEvent(), sub_calendar: submission?.sub_calendar ?? "general" });
    setOpen(true);
  }
  function openEdit(e: any) {
    setEditId(e.id);
    setForm({
      title: e.title, description: e.description ?? "",
      sub_calendar: e.sub_calendar,
      start_at: e.start_at ? format(new Date(e.start_at), "yyyy-MM-dd'T'HH:mm") : "",
      end_at: e.end_at ? format(new Date(e.end_at), "yyyy-MM-dd'T'HH:mm") : "",
      all_day: e.all_day, category: e.category ?? "",
      leader_name: e.leader_name ?? "", location: e.location ?? "",
      room_needed: e.room_needed ?? "", action_note: e.action_note ?? "",
      pco_registration: e.pco_registration,
      missions_team_needed: e.missions_team_needed,
      church_covering: e.church_covering ?? "",
      other_listings: (e.other_listings ?? []).join(", "),
    });
    setOpen(true);
  }

  async function save() {
    const event = {
      title: form.title,
      description: form.description || null,
      sub_calendar: form.sub_calendar as any,
      start_at: form.all_day && form.start_at
        ? new Date(form.start_at.slice(0, 10) + "T12:00:00Z").toISOString()
        : new Date(form.start_at).toISOString(),
      end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
      all_day: form.all_day,
      category: form.category || null,
      leader_name: form.leader_name || null,
      location: form.location || null,
      room_needed: form.room_needed || null,
      action_note: form.action_note || null,
      pco_registration: form.pco_registration,
      missions_team_needed: form.missions_team_needed,
      church_covering: form.church_covering || null,
      other_listings: form.other_listings
        ? form.other_listings.split(",").map(s => s.trim()).filter(Boolean) : [],
    };
    try {
      if (editId) await fnUpd({ data: { id: editId, event } });
      else await fnAdd({ data: { submission_id: submissionId, event } });
      toast.success("Saved");
      setOpen(false);
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this event?")) return;
    await fnDel({ data: { id } });
    load();
  }

  async function submit() {
    if (!confirm("Submit for review? You won't be able to edit after.")) return;
    await fnSubmit({ data: { id: submissionId } });
    toast.success("Submitted");
    load();
  }

  async function trashSub() {
    if (!confirm("Delete this entire plan?")) return;
    await fnDelSub({ data: { id: submissionId } });
    window.location.href = "/calendar/planning";
  }

  function findConflicts(date: string) {
    const day = date.slice(0, 10);
    const others = otherEvents.filter((e: any) => e.start_at.slice(0, 10) === day);
    const masters = masterEvents.filter((e: any) => e.start_at.slice(0, 10) === day);
    return [...others, ...masters];
  }

  if (!submission) return <div>Loading…</div>;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <Link to="/calendar/planning"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1.5" /> Back</Button></Link>
        <div className="flex gap-2">
          {canEdit && events.length > 0 && (
            <Button size="sm" onClick={submit}>Submit for review</Button>
          )}
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={trashSub}><Trash2 className="w-4 h-4" /></Button>
          )}
        </div>
      </div>
      <h1 className="text-2xl font-display font-bold mb-1">
        {submission.sub_calendar.replace(/_/g, " ")} plan
      </h1>
      <div className="text-xs text-muted-foreground mb-6">
        {submission.leader?.full_name ?? "—"} · status: {submission.status}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg">Proposed events</h2>
            {canEdit && (
              <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1.5" /> Add</Button>
            )}
          </div>
          {events.length === 0 && (
            <div className="text-sm text-muted-foreground bg-surface border border-border rounded-2xl p-4">No events yet.</div>
          )}
          <div className="space-y-2">
            {events.map((e: any) => {
              const conflicts = findConflicts(e.start_at);
              return (
                <div key={e.id} className="bg-surface border border-border rounded-2xl px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 cursor-pointer" onClick={() => canEdit && openEdit(e)}>
                      <div className="font-medium">{e.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(e.start_at), "EEE, MMM d")}
                        {e.room_needed ? ` · ${e.room_needed}` : ""}
                        {" · "}{e.status}
                      </div>
                    </div>
                    {canEdit && (
                      <Button variant="ghost" size="sm" onClick={() => remove(e.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  {conflicts.length > 0 && (
                    <div className="mt-2 flex items-start gap-1.5 text-xs text-yellow-700 dark:text-yellow-500">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <div>
                        Same day as: {conflicts.map((c: any) => c.title).join(", ")}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="font-display text-lg mb-3">What else is on that week</h2>
          <p className="text-xs text-muted-foreground mb-3">Master calendar + other submitted plans.</p>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {[...masterEvents.map((e) => ({ ...e, _src: "master" })), ...otherEvents.map((e) => ({ ...e, _src: "plan" }))]
              .sort((a, b) => a.start_at.localeCompare(b.start_at))
              .slice(0, 100)
              .map((e: any, i: number) => (
                <div key={`${e._src}-${e.id}-${i}`} className="text-sm bg-surface border border-border rounded-xl px-3 py-2">
                  <div className="flex items-center justify-between">
                    <div>{e.title}</div>
                    <div className="text-xs text-muted-foreground">{format(new Date(e.start_at), "MMM d")}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {e.sub_calendar?.replace(/_/g, " ")}
                    {e._src === "plan" && " · pending"}
                  </div>
                </div>
              ))}
          </div>
        </section>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Edit" : "Add"} proposed event</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Starts</Label>
                <Input type={form.all_day ? "date" : "datetime-local"}
                  value={form.all_day ? form.start_at.slice(0, 10) : form.start_at}
                  onChange={(e) => setForm({ ...form, start_at: form.all_day ? e.target.value + "T00:00" : e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Ends</Label>
                <Input type={form.all_day ? "date" : "datetime-local"}
                  value={form.all_day ? (form.end_at ? form.end_at.slice(0, 10) : "") : form.end_at}
                  onChange={(e) => setForm({ ...form, end_at: form.all_day ? (e.target.value ? e.target.value + "T23:59" : "") : e.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.all_day} onCheckedChange={(v) => setForm({ ...form, all_day: v })} />
              All day
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Leader</Label>
                <Input value={form.leader_name} onChange={(e) => setForm({ ...form, leader_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Room needed</Label>
                <Input value={form.room_needed} onChange={(e) => setForm({ ...form, room_needed: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Church covering</Label>
                <Input value={form.church_covering} onChange={(e) => setForm({ ...form, church_covering: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Other listings</Label>
                <Input placeholder="comma-separated" value={form.other_listings}
                  onChange={(e) => setForm({ ...form, other_listings: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Action / follow-up</Label>
              <Textarea rows={2} value={form.action_note} onChange={(e) => setForm({ ...form, action_note: e.target.value })} />
            </div>
            <div className="flex gap-6 text-sm">
              <label className="flex items-center gap-2">
                <Switch checked={form.pco_registration} onCheckedChange={(v) => setForm({ ...form, pco_registration: v })} />
                PCO registration
              </label>
              <label className="flex items-center gap-2">
                <Switch checked={form.missions_team_needed} onCheckedChange={(v) => setForm({ ...form, missions_team_needed: v })} />
                Missions team
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
