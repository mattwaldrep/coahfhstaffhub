import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { GraduationCap, Plus, Trash2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  upsertClassSeries,
  setClassSeriesActive,
  deleteClassSeries,
} from "@/server/class-series.functions";

export const Route = createFileRoute("/calendar_/classes")({ component: ClassesPage });

const WEEKDAYS_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WD_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
type WDCode = (typeof WD_CODES)[number];

const SETPOS_LABELS: Record<string, string> = {
  "1": "1st", "2": "2nd", "3": "3rd", "4": "4th", "-1": "Last",
};

type Room = { id: string; name: string };
type ClassSeries = {
  id: string;
  name: string;
  active: boolean;
  weekday: number;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  freq: string;
  interval: number;
  byweekday: string[];
  bysetpos: number | null;
  excluded_dates: string[];
  default_teacher_name: string | null;
  default_leader_name: string | null;
  default_childcare_needed: boolean;
  default_room_id: string | null;
  calendar_event_id: string | null;
};

type FormState = {
  id?: string;
  name: string;
  active: boolean;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  freq: "WEEKLY" | "MONTHLY";
  interval: number;
  byweekday: WDCode[];
  bysetpos: string; // "", "1", "2", ... "-1"
  excluded_dates: string[];
  default_teacher_name: string;
  default_leader_name: string;
  default_childcare_needed: boolean;
  default_room_id: string;
};

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): FormState => ({
  name: "",
  active: true,
  start_date: today(),
  end_date: "",
  start_time: "",
  end_time: "",
  freq: "WEEKLY",
  interval: 1,
  byweekday: [],
  bysetpos: "",
  excluded_dates: [],
  default_teacher_name: "",
  default_leader_name: "",
  default_childcare_needed: false,
  default_room_id: "",
});

function ClassesPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("core");
  const [rows, setRows] = useState<ClassSeries[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const upsertFn = useServerFn(upsertClassSeries);
  const setActiveFn = useServerFn(setClassSeriesActive);
  const deleteFn = useServerFn(deleteClassSeries);

  async function load() {
    setLoading(true);
    const [{ data: cls }, { data: rms }] = await Promise.all([
      supabase.from("class_series").select("*").order("active", { ascending: false }).order("name"),
      supabase.from("rooms").select("id,name").eq("active", true).order("name"),
    ]);
    setRows((cls ?? []) as ClassSeries[]);
    setRooms((rms ?? []) as Room[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openAdd() {
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(c: ClassSeries) {
    setForm({
      id: c.id,
      name: c.name,
      active: c.active,
      start_date: c.start_date ?? today(),
      end_date: c.end_date ?? "",
      start_time: c.start_time?.slice(0, 5) ?? "",
      end_time: c.end_time?.slice(0, 5) ?? "",
      freq: (c.freq === "MONTHLY" ? "MONTHLY" : "WEEKLY"),
      interval: c.interval || 1,
      byweekday: (c.byweekday ?? []).filter((w): w is WDCode => (WD_CODES as readonly string[]).includes(w)),
      bysetpos: c.bysetpos != null ? String(c.bysetpos) : "",
      excluded_dates: c.excluded_dates ?? [],
      default_teacher_name: c.default_teacher_name ?? "",
      default_leader_name: c.default_leader_name ?? "",
      default_childcare_needed: c.default_childcare_needed,
      default_room_id: c.default_room_id ?? "",
    });
    setDialogOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Class needs a name");
      return;
    }
    if (form.byweekday.length === 0) {
      toast.error("Pick at least one weekday for the class to recur");
      return;
    }
    if (!form.start_date) {
      toast.error("Start date is required");
      return;
    }
    setSaving(true);
    try {
      await upsertFn({
        data: {
          id: form.id,
          name: form.name.trim(),
          active: form.active,
          start_date: form.start_date,
          end_date: form.end_date || null,
          start_time: form.start_time || null,
          end_time: form.end_time || null,
          freq: form.freq,
          interval: form.interval || 1,
          byweekday: form.byweekday,
          bysetpos: form.freq === "MONTHLY" && form.bysetpos ? Number(form.bysetpos) : null,
          excluded_dates: form.excluded_dates,
          default_teacher_name: form.default_teacher_name.trim() || null,
          default_leader_name: form.default_leader_name.trim() || null,
          default_childcare_needed: form.default_childcare_needed,
          default_room_id: form.default_room_id || null,
        },
      });
      toast.success(form.id ? "Class updated" : "Class added to calendar");
      setDialogOpen(false);
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't save class");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: ClassSeries) {
    try {
      await setActiveFn({ data: { id: c.id, active: !c.active } });
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't update");
    }
  }

  async function removeClass(c: ClassSeries) {
    if (!confirm(`Delete "${c.name}" and remove it from the calendar?`)) return;
    try {
      await deleteFn({ data: { id: c.id } });
      toast.success("Class deleted");
      load();
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't delete");
    }
  }

  function toggleWeekday(code: WDCode) {
    setForm((f) => ({
      ...f,
      byweekday: f.byweekday.includes(code)
        ? f.byweekday.filter((w) => w !== code)
        : [...f.byweekday, code],
    }));
  }

  const [newSkipDate, setNewSkipDate] = useState("");
  function addSkip() {
    if (!newSkipDate) return;
    if (form.excluded_dates.includes(newSkipDate)) return;
    setForm((f) => ({ ...f, excluded_dates: [...f.excluded_dates, newSkipDate].sort() }));
    setNewSkipDate("");
  }
  function removeSkip(d: string) {
    setForm((f) => ({ ...f, excluded_dates: f.excluded_dates.filter((x) => x !== d) }));
  }

  const recurrenceSummary = useMemo(() => describeRecurrence(form), [form]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold">Class series</h1>
            <p className="text-sm text-muted-foreground">
              Recurring classes — saving here adds them to the calendar automatically.
            </p>
          </div>
          {canEdit && (
            <Button onClick={openAdd}>
              <Plus className="w-4 h-4 mr-1" />Add class
            </Button>
          )}
        </header>

        <Card>
          <CardHeader><CardTitle className="text-base">All classes</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : rows.length === 0 ? (
              <EmptyState icon={GraduationCap} title="No class series yet" description="Add recurring classes to streamline scheduling." />
            ) : (
              <ul className="divide-y">
                {rows.map((c) => {
                  const room = rooms.find((r) => r.id === c.default_room_id);
                  return (
                    <li key={c.id} className="py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{c.name}</span>
                          {!c.active && <Badge variant="outline" className="text-xs">archived</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {describeSavedRecurrence(c)}
                          {c.start_time ? ` · ${c.start_time.slice(0, 5)}` : ""}
                          {c.end_time ? `–${c.end_time.slice(0, 5)}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[
                            c.default_teacher_name && `Teacher: ${c.default_teacher_name}`,
                            c.default_leader_name && `Leader: ${c.default_leader_name}`,
                            room && `Room: ${room.name}`,
                            c.default_childcare_needed && "Childcare",
                            c.excluded_dates?.length ? `${c.excluded_dates.length} skip date${c.excluded_dates.length > 1 ? "s" : ""}` : null,
                          ].filter(Boolean).join(" · ") || "No defaults set"}
                        </p>
                      </div>
                      {canEdit && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(c)} aria-label="Edit">
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Switch checked={c.active} onCheckedChange={() => toggleActive(c)} aria-label="Active" />
                          <Button variant="ghost" size="icon" onClick={() => removeClass(c)} aria-label="Delete">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit class" : "Add class"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-5">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Start date</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required />
              </div>
              <div>
                <Label className="text-xs">End date (optional)</Label>
                <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Start time</Label>
                <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">End time</Label>
                <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-xs">Repeats</Label>
                <Select value={form.freq} onValueChange={(v) => setForm({ ...form, freq: v as "WEEKLY" | "MONTHLY", bysetpos: "" })}>
                  <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WEEKLY">Weekly</SelectItem>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap">Every</Label>
                <Input
                  type="number"
                  min={1}
                  max={52}
                  className="w-20 h-8"
                  value={form.interval}
                  onChange={(e) => setForm({ ...form, interval: Math.max(1, Number(e.target.value) || 1) })}
                />
                <span className="text-sm text-muted-foreground">
                  {form.freq === "WEEKLY" ? (form.interval === 1 ? "week" : "weeks") : (form.interval === 1 ? "month" : "months")}
                </span>
              </div>

              <div>
                <Label className="text-xs">On</Label>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {WD_CODES.map((code, i) => {
                    const on = form.byweekday.includes(code);
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => toggleWeekday(code)}
                        className={`px-2.5 py-1 text-xs rounded-md border ${on ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                      >
                        {WEEKDAYS_FULL[i]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {form.freq === "MONTHLY" && (
                <div>
                  <Label className="text-xs">Position in month</Label>
                  <Select value={form.bysetpos || "any"} onValueChange={(v) => setForm({ ...form, bysetpos: v === "any" ? "" : v })}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Any matching date" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any matching date</SelectItem>
                      {Object.entries(SETPOS_LABELS).map(([k, label]) => (
                        <SelectItem key={k} value={k}>{label} weekday of the month</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <p className="text-xs text-muted-foreground italic">{recurrenceSummary}</p>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <Label className="text-xs">Skip dates (holidays, breaks)</Label>
              <div className="flex gap-2">
                <Input type="date" value={newSkipDate} onChange={(e) => setNewSkipDate(e.target.value)} className="h-8" />
                <Button type="button" variant="secondary" size="sm" onClick={addSkip}>Add</Button>
              </div>
              {form.excluded_dates.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {form.excluded_dates.map((d) => (
                    <Badge key={d} variant="secondary" className="gap-1">
                      {d}
                      <button type="button" onClick={() => removeSkip(d)} aria-label={`Remove ${d}`}>
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Teacher</Label>
                <Input value={form.default_teacher_name} onChange={(e) => setForm({ ...form, default_teacher_name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Leader</Label>
                <Input value={form.default_leader_name} onChange={(e) => setForm({ ...form, default_leader_name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Default room</Label>
                <Select
                  value={form.default_room_id || "none"}
                  onValueChange={(v) => setForm({ ...form, default_room_id: v === "none" ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Switch
                  id="cc"
                  checked={form.default_childcare_needed}
                  onCheckedChange={(v) => setForm({ ...form, default_childcare_needed: v })}
                />
                <Label htmlFor="cc" className="text-sm">Needs childcare</Label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : (form.id ? "Save changes" : "Add class")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function describeRecurrence(f: FormState): string {
  if (f.byweekday.length === 0) return "Pick at least one weekday.";
  const dayNames = f.byweekday
    .map((c) => WEEKDAYS_FULL[WD_CODES.indexOf(c)])
    .join(", ");
  const every = f.interval > 1 ? `every ${f.interval} ` : "";
  if (f.freq === "WEEKLY") {
    return `Repeats ${every}${f.interval > 1 ? "weeks" : "week"} on ${dayNames}.`;
  }
  const pos = f.bysetpos ? `${SETPOS_LABELS[f.bysetpos]} ` : "";
  return `Repeats ${every}${f.interval > 1 ? "months" : "month"} on the ${pos}${dayNames}.`;
}

function describeSavedRecurrence(c: ClassSeries): string {
  const days = (c.byweekday ?? [])
    .map((w) => {
      const i = WD_CODES.indexOf(w as WDCode);
      return i >= 0 ? WEEKDAYS_FULL[i] : null;
    })
    .filter(Boolean)
    .join(", ");
  const every = c.interval > 1 ? `every ${c.interval} ` : "";
  if (c.freq === "MONTHLY") {
    const pos = c.bysetpos ? `${SETPOS_LABELS[String(c.bysetpos)] ?? ""} ` : "";
    return `${every}${c.interval > 1 ? "months" : "month"} · ${pos}${days || WEEKDAYS_FULL[c.weekday]}`;
  }
  return `${every}${c.interval > 1 ? "weeks" : "week"} · ${days || WEEKDAYS_FULL[c.weekday]}`;
}
