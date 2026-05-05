import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/calendar")({
  component: CalendarPage,
});

const SUB_CALS = [
  { value: "forest_hills_main", label: "Forest Hills Main", color: "var(--cal-main)" },
  { value: "coah_lm", label: "COAH:LM", color: "var(--cal-lm)" },
  { value: "youth", label: "Youth", color: "var(--cal-youth)" },
  { value: "general", label: "General", color: "var(--cal-general)" },
];

interface Event {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  sub_calendar: string;
  leader_name: string | null;
}

function CalendarPage() {
  return (
    <AppShell>
      <CalendarBody />
    </AppShell>
  );
}

function CalendarBody() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("core");
  const [events, setEvents] = useState<Event[]>([]);
  const [filters, setFilters] = useState<Record<string, boolean>>({
    forest_hills_main: true,
    coah_lm: true,
    youth: true,
    general: true,
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    sub_calendar: "general",
    start_at: "",
    leader_name: "",
    description: "",
  });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data } = await supabase
      .from("calendar_events")
      .select("*")
      .gte("start_at", new Date(Date.now() - 86400000).toISOString())
      .order("start_at", { ascending: true });
    setEvents(data ?? []);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("calendar_events").insert({
      title: form.title,
      sub_calendar: form.sub_calendar as any,
      start_at: new Date(form.start_at).toISOString(),
      leader_name: form.leader_name || null,
      description: form.description || null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Event added");
    setOpen(false);
    setForm({ title: "", sub_calendar: "general", start_at: "", leader_name: "", description: "" });
    load();
  }

  const visible = events.filter((e) => filters[e.sub_calendar]);

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Calendar</h1>
          <p className="text-muted-foreground mt-2">Layered church calendar across all sub-calendars.</p>
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" /> New event
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add event</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Sub-calendar</Label>
                    <Select value={form.sub_calendar} onValueChange={(v) => setForm({ ...form, sub_calendar: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SUB_CALS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Date & time</Label>
                    <Input type="datetime-local" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Leader</Label>
                  <Input value={form.leader_name} onChange={(e) => setForm({ ...form, leader_name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <Button type="submit" className="w-full">Save event</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {SUB_CALS.map((s) => (
          <button
            key={s.value}
            onClick={() => setFilters({ ...filters, [s.value]: !filters[s.value] })}
            className={`text-xs px-3 py-1.5 rounded-full border transition ${
              filters[s.value] ? "bg-surface border-border" : "bg-transparent border-border/50 text-muted-foreground"
            }`}
          >
            <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: s.color }} />
            {s.label}
          </button>
        ))}
      </div>

      <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
        {visible.length === 0 ? (
          <div className="p-8 text-sm text-muted-foreground text-center">No events to show.</div>
        ) : (
          visible.map((e) => {
            const cal = SUB_CALS.find((s) => s.value === e.sub_calendar)!;
            return (
              <div key={e.id} className="p-5 flex items-center gap-4">
                <div className="w-1 self-stretch rounded-full" style={{ background: cal.color }} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{e.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {cal.label}
                    {e.leader_name && <> · Led by {e.leader_name}</>}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground shrink-0 text-right">
                  <div>{format(new Date(e.start_at), "EEE, MMM d")}</div>
                  <div className="text-xs">{format(new Date(e.start_at), "p")}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
