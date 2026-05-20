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
import { EmptyState } from "@/components/ui/empty-state";
import { DoorOpen, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/rooms")({ component: RoomsPage });

type Room = {
  id: string;
  name: string;
  capacity: number | null;
  notes: string | null;
  active: boolean;
};

function RoomsPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("core");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [notes, setNotes] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      .order("name");
    if (error) toast.error(error.message);
    else setRooms((data ?? []) as Room[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function addRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const { error } = await supabase.from("rooms").insert({
      name: name.trim(),
      capacity: capacity ? Number(capacity) : null,
      notes: notes.trim() || null,
    });
    if (error) return toast.error(error.message);
    setName(""); setCapacity(""); setNotes("");
    toast.success("Room added");
    load();
  }

  async function toggleActive(r: Room) {
    const { error } = await supabase.from("rooms").update({ active: !r.active }).eq("id", r.id);
    if (error) return toast.error(error.message);
    setRooms((rs) => rs.map((x) => (x.id === r.id ? { ...x, active: !r.active } : x)));
  }

  async function removeRoom(r: Room) {
    if (!confirm(`Delete ${r.name}? This removes it from all events.`)) return;
    const { error } = await supabase.from("rooms").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    setRooms((rs) => rs.filter((x) => x.id !== r.id));
    toast.success("Room deleted");
  }

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-display font-bold">Rooms</h1>
          <p className="text-sm text-muted-foreground">Manage bookable spaces. Used for event scheduling and conflict detection.</p>
        </header>

        {canEdit && (
          <Card>
            <CardHeader><CardTitle className="text-base">Add room</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={addRoom} className="grid gap-3 md:grid-cols-[1fr_120px_1fr_auto]">
                <div><Label className="text-xs">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
                <div><Label className="text-xs">Capacity</Label><Input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} /></div>
                <div><Label className="text-xs">Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
                <div className="self-end"><Button type="submit"><Plus className="w-4 h-4 mr-1" />Add</Button></div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">All rooms</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : rooms.length === 0 ? (
              <EmptyState icon={DoorOpen} title="No rooms yet" description="Add your first space above." />
            ) : (
              <ul className="divide-y">
                {rooms.map((r) => (
                  <li key={r.id} className="py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{r.name}</span>
                        {r.capacity != null && <span className="text-xs text-muted-foreground">· cap {r.capacity}</span>}
                        {!r.active && <span className="text-xs text-muted-foreground italic">archived</span>}
                      </div>
                      {r.notes && <p className="text-xs text-muted-foreground truncate">{r.notes}</p>}
                    </div>
                    {canEdit && (
                      <>
                        <Switch checked={r.active} onCheckedChange={() => toggleActive(r)} />
                        <Button variant="ghost" size="icon" onClick={() => removeRoom(r)} aria-label="Delete">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
