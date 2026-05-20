import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { GraduationCap, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/calendar/classes")({ component: ClassesPage });

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Room = { id: string; name: string };
type ClassSeries = {
  id: string;
  name: string;
  weekday: number;
  start_time: string | null;
  end_time: string | null;
  default_teacher_name: string | null;
  default_leader_name: string | null;
  default_childcare_needed: boolean;
  default_room_id: string | null;
  active: boolean;
};

function ClassesPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("core");
  const [rows, setRows] = useState<ClassSeries[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [weekday, setWeekday] = useState("0");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [teacher, setTeacher] = useState("");
  const [leader, setLeader] = useState("");
  const [childcare, setChildcare] = useState(false);
  const [roomId, setRoomId] = useState<string>("");

  async function load() {
    setLoading(true);
    const [{ data: cls }, { data: rms }] = await Promise.all([
      supabase.from("class_series").select("*").order("weekday").order("start_time"),
      supabase.from("rooms").select("id,name").eq("active", true).order("name"),
    ]);
    setRows((cls ?? []) as ClassSeries[]);
    setRooms((rms ?? []) as Room[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function addClass(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const { error } = await supabase.from("class_series").insert({
      name: name.trim(),
      weekday: Number(weekday),
      start_time: startTime || null,
      end_time: endTime || null,
      default_teacher_name: teacher.trim() || null,
      default_leader_name: leader.trim() || null,
      default_childcare_needed: childcare,
      default_room_id: roomId || null,
    });
    if (error) return toast.error(error.message);
    setName(""); setStartTime(""); setEndTime("");
    setTeacher(""); setLeader(""); setChildcare(false); setRoomId("");
    toast.success("Class added");
    load();
  }

  async function toggleActive(c: ClassSeries) {
    const { error } = await supabase.from("class_series").update({ active: !c.active }).eq("id", c.id);
    if (error) return toast.error(error.message);
    setRows((rs) => rs.map((x) => (x.id === c.id ? { ...x, active: !c.active } : x)));
  }

  async function removeClass(c: ClassSeries) {
    if (!confirm(`Delete ${c.name}?`)) return;
    const { error } = await supabase.from("class_series").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    setRows((rs) => rs.filter((x) => x.id !== c.id));
    toast.success("Class deleted");
  }

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-display font-bold">Class series</h1>
          <p className="text-sm text-muted-foreground">
            Recurring classes that auto-fill teacher, childcare, and room when scheduling events.
          </p>
        </header>

        {canEdit && (
          <Card>
            <CardHeader><CardTitle className="text-base">Add class</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={addClass} className="grid gap-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Label className="text-xs">Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div>
                  <Label className="text-xs">Weekday</Label>
                  <Select value={weekday} onValueChange={setWeekday}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Start</Label><Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
                  <div><Label className="text-xs">End</Label><Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></div>
                </div>
                <div><Label className="text-xs">Teacher</Label><Input value={teacher} onChange={(e) => setTeacher(e.target.value)} /></div>
                <div><Label className="text-xs">Leader</Label><Input value={leader} onChange={(e) => setLeader(e.target.value)} /></div>
                <div>
                  <Label className="text-xs">Default room</Label>
                  <Select value={roomId || "none"} onValueChange={(v) => setRoomId(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <Switch checked={childcare} onCheckedChange={setChildcare} id="cc" />
                  <Label htmlFor="cc" className="text-sm">Needs childcare</Label>
                </div>
                <div className="md:col-span-2">
                  <Button type="submit"><Plus className="w-4 h-4 mr-1" />Add class</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">All classes</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : rows.length === 0 ? (
              <EmptyState icon={GraduationCap} title="No class series yet" description="Add recurring classes to streamline event scheduling." />
            ) : (
              <ul className="divide-y">
                {rows.map((c) => {
                  const room = rooms.find((r) => r.id === c.default_room_id);
                  return (
                    <li key={c.id} className="py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{c.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {WEEKDAYS[c.weekday]}{c.start_time ? ` · ${c.start_time.slice(0, 5)}` : ""}{c.end_time ? `–${c.end_time.slice(0, 5)}` : ""}
                          </span>
                          {!c.active && <span className="text-xs text-muted-foreground italic">archived</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {[c.default_teacher_name && `Teacher: ${c.default_teacher_name}`,
                            c.default_leader_name && `Leader: ${c.default_leader_name}`,
                            room && `Room: ${room.name}`,
                            c.default_childcare_needed && "Childcare"]
                            .filter(Boolean).join(" · ") || "No defaults set"}
                        </p>
                      </div>
                      {canEdit && (
                        <>
                          <Switch checked={c.active} onCheckedChange={() => toggleActive(c)} />
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
    </AppShell>
  );
}
