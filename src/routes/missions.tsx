import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ExternalLink, Mail, Phone, Upload, FileText, X as XIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/missions")({
  component: MissionsPage,
});

const STEPS = [
  { key: "confirmation", label: "Confirmation" },
  { key: "welcome_email", label: "Welcome email" },
  { key: "questionnaire_received", label: "Questionnaire received" },
  { key: "planning_call", label: "Planning call" },
  { key: "draft_schedule", label: "Draft schedule" },
  { key: "confirm_schedule", label: "Confirm schedule & staff leads" },
  { key: "place_supplies", label: "Place supplies orders" },
  { key: "send_final_schedule", label: "Send final schedule" },
  { key: "orientation", label: "Orientation session" },
  { key: "daily_check_in", label: "Daily leader check-in" },
  { key: "thank_you", label: "Thank-you & feedback" },
  { key: "debrief", label: "Debrief call" },
];

const COLUMNS = [
  { value: "not_started", label: "Not started" },
  { value: "tbc", label: "TBC" },
  { value: "pre_trip", label: "Pre-Trip" },
  { value: "in_field", label: "In Field" },
  { value: "complete", label: "Complete" },
  { value: "cancelled", label: "Cancelled" },
] as const;

type Status = typeof COLUMNS[number]["value"];

type Trip = {
  id: string;
  church_name: string;
  start_date: string | null;
  end_date: string | null;
  leader_name: string | null;
  leader_phone: string | null;
  leader_email: string | null;
  primary_focus: string | null;
  team_number: string | null;
  status: Status;
  itinerary_link: string | null;
  itinerary_file_path: string | null;
  itinerary_file_name: string | null;
  notes: string | null;
  steps: Record<string, boolean>;
  position: number;
};

type Form = Omit<Trip, "id" | "position"> & { id?: string };

const emptyForm = (): Form => ({
  church_name: "",
  start_date: null,
  end_date: null,
  leader_name: "",
  leader_phone: "",
  leader_email: "",
  primary_focus: "",
  team_number: "",
  status: "not_started",
  itinerary_link: "",
  itinerary_file_path: null,
  itinerary_file_name: null,
  notes: "",
  steps: Object.fromEntries(STEPS.map((s) => [s.key, false])),
});

function MissionsPage() {
  return (
    <AppShell>
      <Body />
    </AppShell>
  );
}

function Body() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("core") || hasRole("meeting");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm());
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("mission_trips")
      .on("postgres_changes", { event: "*", schema: "public", table: "mission_trips" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function load() {
    const { data } = await supabase
      .from("mission_trips")
      .select("*")
      .order("start_date", { ascending: true, nullsFirst: false });
    setTrips((data ?? []) as Trip[]);
  }

  function openNew() {
    if (!canEdit) return;
    setForm(emptyForm());
    setOpen(true);
  }

  function openEdit(t: Trip) {
    if (!canEdit) return;
    setForm({
      id: t.id,
      church_name: t.church_name,
      start_date: t.start_date,
      end_date: t.end_date,
      leader_name: t.leader_name ?? "",
      leader_phone: t.leader_phone ?? "",
      leader_email: t.leader_email ?? "",
      primary_focus: t.primary_focus ?? "",
      team_number: t.team_number ?? "",
      status: t.status,
      itinerary_link: t.itinerary_link ?? "",
      itinerary_file_path: t.itinerary_file_path ?? null,
      itinerary_file_name: t.itinerary_file_name ?? null,
      notes: t.notes ?? "",
      steps: { ...Object.fromEntries(STEPS.map((s) => [s.key, false])), ...(t.steps ?? {}) },
    });
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      church_name: form.church_name,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      leader_name: form.leader_name || null,
      leader_phone: form.leader_phone || null,
      leader_email: form.leader_email || null,
      primary_focus: form.primary_focus || null,
      team_number: form.team_number || null,
      status: form.status,
      itinerary_link: form.itinerary_link || null,
      itinerary_file_path: form.itinerary_file_path,
      itinerary_file_name: form.itinerary_file_name,
      notes: form.notes || null,
      steps: form.steps,
    };
    const { error } = form.id
      ? await supabase.from("mission_trips").update(payload).eq("id", form.id)
      : await supabase.from("mission_trips").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(form.id ? "Trip updated" : "Trip added");
    setOpen(false);
    load();
  }

  async function remove() {
    if (!form.id) return;
    const { error } = await supabase.from("mission_trips").delete().eq("id", form.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Trip deleted");
    setOpen(false);
    load();
  }

  async function moveTrip(trip: Trip, status: Status) {
    if (!canEdit) return;
    const { error } = await supabase.from("mission_trips").update({ status }).eq("id", trip.id);
    if (error) toast.error(error.message);
  }




  async function uploadItinerary(file: File) {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${form.id ?? "new"}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("mission-trips").upload(path, file, { upsert: true });
      if (error) { toast.error(error.message); return; }
      setForm((f) => ({ ...f, itinerary_file_path: path, itinerary_file_name: file.name }));
      toast.success("Itinerary uploaded");
    } finally {
      setUploading(false);
    }
  }

  async function openItinerary(path: string) {
    const { data, error } = await supabase.storage.from("mission-trips").createSignedUrl(path, 60);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank");
  }

  function clearItinerary() {
    setForm((f) => ({ ...f, itinerary_file_path: null, itinerary_file_name: null }));
  }

  const filteredTrips = useMemo(
    () => statusFilter === "all" ? trips : trips.filter((t) => t.status === statusFilter),
    [trips, statusFilter],
  );

  const byStatus = useMemo(() => {
    const m: Record<Status, Trip[]> = {
      not_started: [], tbc: [], pre_trip: [], in_field: [], complete: [], cancelled: [],
    };
    for (const t of filteredTrips) m[t.status]?.push(t);
    return m;
  }, [filteredTrips]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Missions</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Track inbound missions teams across the 12-step readiness pipeline.
          </p>
        </div>
        {canEdit && (
          <Button onClick={openNew} size="sm">
            <Plus className="w-4 h-4 mr-1.5" /> New trip
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {COLUMNS.map((col) => (
          <div key={col.value} className="bg-surface border border-border rounded-2xl p-3 flex flex-col min-h-[20rem]">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {col.label}
              </div>
              <div className="text-xs text-muted-foreground">{byStatus[col.value].length}</div>
            </div>
            <div className="space-y-2 flex-1">
              {byStatus[col.value].map((t) => (
                <TripCard
                  key={t.id}
                  trip={t}
                  onClick={() => openEdit(t)}
                  onMove={(s) => moveTrip(t, s)}
                  canEdit={canEdit}
                />
              ))}
              {byStatus[col.value].length === 0 && (
                <div className="text-[11px] text-muted-foreground/50 text-center py-4">—</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit trip" : "New trip"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2 col-span-2">
                <Label>Church name</Label>
                <Input value={form.church_name} onChange={(e) => setForm({ ...form, church_name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Start date</Label>
                <Input type="date" value={form.start_date ?? ""} onChange={(e) => setForm({ ...form, start_date: e.target.value || null })} />
              </div>
              <div className="space-y-2">
                <Label>End date</Label>
                <Input type="date" value={form.end_date ?? ""} onChange={(e) => setForm({ ...form, end_date: e.target.value || null })} />
              </div>
              <div className="space-y-2">
                <Label>Leader</Label>
                <Input value={form.leader_name ?? ""} onChange={(e) => setForm({ ...form, leader_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COLUMNS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Leader phone</Label>
                <Input value={form.leader_phone ?? ""} onChange={(e) => setForm({ ...form, leader_phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Leader email</Label>
                <Input type="email" value={form.leader_email ?? ""} onChange={(e) => setForm({ ...form, leader_email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Primary focus</Label>
                <Input value={form.primary_focus ?? ""} onChange={(e) => setForm({ ...form, primary_focus: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Team #</Label>
                <Input value={form.team_number ?? ""} onChange={(e) => setForm({ ...form, team_number: e.target.value })} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Itinerary link</Label>
                <Input value={form.itinerary_link ?? ""} onChange={(e) => setForm({ ...form, itinerary_link: e.target.value })} placeholder="https://…" />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Notes</Label>
                <Textarea rows={3} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>

            <div className="rounded-xl border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Readiness checklist</Label>
                <ProgressBadge steps={form.steps} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {STEPS.map((s) => (
                  <label key={s.key} className="flex items-center gap-2 text-sm py-1">
                    <Checkbox
                      checked={!!form.steps[s.key]}
                      onCheckedChange={(v) => setForm({ ...form, steps: { ...form.steps, [s.key]: !!v } })}
                    />
                    <span className={form.steps[s.key] ? "line-through text-muted-foreground" : ""}>{s.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <DialogFooter className="flex sm:justify-between gap-2 flex-wrap">
              {form.id ? (
                <Button type="button" variant="ghost" onClick={remove}>
                  <Trash2 className="w-4 h-4 mr-1.5" /> Delete
                </Button>
              ) : <span />}
              <Button type="submit">{form.id ? "Save changes" : "Add trip"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProgressBadge({ steps }: { steps: Record<string, boolean> }) {
  const done = STEPS.filter((s) => steps[s.key]).length;
  const pct = Math.round((done / STEPS.length) * 100);
  const color = pct === 100 ? "oklch(0.7 0.18 145)" : pct >= 50 ? "oklch(0.82 0.16 90)" : "oklch(0.65 0.22 25)";
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full"
      style={{ background: `color-mix(in oklab, ${color} 22%, transparent)`, color }}>
      {done}/{STEPS.length}
    </span>
  );
}

function TripCard({
  trip, onClick, onMove, canEdit,
}: {
  trip: Trip;
  onClick: () => void;
  onMove: (s: Status) => void;
  canEdit: boolean;
}) {
  const done = STEPS.filter((s) => trip.steps?.[s.key]).length;
  const pct = (done / STEPS.length) * 100;
  return (
    <div className="bg-background/60 border border-border rounded-xl p-3 hover:border-border/80 transition cursor-pointer group"
      onClick={onClick}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="font-medium text-sm leading-tight">{trip.church_name}</div>
        <ProgressBadge steps={trip.steps ?? {}} />
      </div>
      {trip.start_date && (
        <div className="text-[11px] text-muted-foreground">
          {format(new Date(trip.start_date), "MMM d")}
          {trip.end_date && <> – {format(new Date(trip.end_date), "MMM d, yyyy")}</>}
        </div>
      )}
      {trip.leader_name && (
        <div className="text-[11px] text-muted-foreground mt-0.5">{trip.leader_name}</div>
      )}
      {trip.primary_focus && (
        <div className="text-[10px] text-muted-foreground/80 mt-1 line-clamp-2">{trip.primary_focus}</div>
      )}
      <div className="mt-2 h-1 rounded-full bg-border overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-1.5 mt-2 text-muted-foreground">
        {trip.leader_email && (
          <a href={`mailto:${trip.leader_email}`} onClick={(e) => e.stopPropagation()} title={trip.leader_email}
            className="hover:text-foreground"><Mail className="w-3 h-3" /></a>
        )}
        {trip.leader_phone && (
          <a href={`tel:${trip.leader_phone}`} onClick={(e) => e.stopPropagation()} title={trip.leader_phone}
            className="hover:text-foreground"><Phone className="w-3 h-3" /></a>
        )}
        {trip.itinerary_link && (
          <a href={trip.itinerary_link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
            className="hover:text-foreground"><ExternalLink className="w-3 h-3" /></a>
        )}
        {canEdit && (
          <select
            value={trip.status}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onMove(e.target.value as Status)}
            aria-label="Move trip to status"
            className="ml-auto text-[10px] bg-transparent border border-border rounded px-1 py-0.5 text-muted-foreground hover:text-foreground"
          >
            {COLUMNS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}
