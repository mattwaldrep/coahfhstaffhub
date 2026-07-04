import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Settings as SettingsIcon, Plus, Trash2, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import {
  listSubCalendars,
  createSubCalendar,
  updateSubCalendar,
  deleteSubCalendar,
  listSubCalendarSuggestions,
  approveSubCalendarSuggestion,
  dismissSubCalendarSuggestion,
  listStaffProfiles,
  syncServeTeamSubCalendars,
  type SubCalendarRow,
} from "@/lib/sub-calendars.functions";

export const Route = createFileRoute("/calendar_/settings")({
  component: () => (
    <AppShell>
      <SettingsPage />
    </AppShell>
  ),
});

// Broad palette — themed CSS tokens plus a spectrum of hexes. Users can also
// pick any custom color via the color input.
const PRESET_COLORS: { value: string; label: string }[] = [
  { value: "var(--cal-main)", label: "Blue (General)" },
  { value: "var(--cal-lm)", label: "COAH:LM" },
  { value: "var(--cal-youth)", label: "Youth" },
  { value: "var(--cal-missions)", label: "Missions" },
  { value: "var(--cal-general)", label: "Neutral" },
  { value: "#ef4444", label: "Red" },
  { value: "#f97316", label: "Orange" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#eab308", label: "Yellow" },
  { value: "#84cc16", label: "Lime" },
  { value: "#22c55e", label: "Green" },
  { value: "#10b981", label: "Emerald" },
  { value: "#14b8a6", label: "Teal" },
  { value: "#06b6d4", label: "Cyan" },
  { value: "#0ea5e9", label: "Sky" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#6366f1", label: "Indigo" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#a855f7", label: "Purple" },
  { value: "#d946ef", label: "Fuchsia" },
  { value: "#ec4899", label: "Pink" },
  { value: "#f43f5e", label: "Rose" },
  { value: "#78716c", label: "Stone" },
  { value: "#64748b", label: "Slate" },
  { value: "#0f766e", label: "Dark teal" },
  { value: "#7c2d12", label: "Rust" },
];

function ColorSwatch({ token }: { token: string }) {
  return (
    <span
      className="inline-block w-4 h-4 rounded"
      style={{ background: token, border: "1px solid var(--border)" }}
    />
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Two-part control: swatch grid + custom hex input.
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-8 gap-1.5">
        {PRESET_COLORS.map((c) => {
          const selected = c.value === value;
          return (
            <button
              key={c.value}
              type="button"
              title={c.label}
              onClick={() => onChange(c.value)}
              className={`h-7 w-7 rounded-md border transition ${selected ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : "hover:scale-110"}`}
              style={{ background: c.value, borderColor: "var(--border)" }}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Custom:</Label>
        <input
          type="color"
          value={value.startsWith("#") ? value : "#3b82f6"}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-10 rounded border border-border bg-transparent cursor-pointer"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 text-xs font-mono flex-1"
          placeholder="#3b82f6 or var(--cal-main)"
        />
      </div>
    </div>
  );
}


function SettingsPage() {
  const { hasRole } = useAuth();
  const isCore = hasRole("core");
  const fetchList = useServerFn(listSubCalendars);
  const fetchSuggestions = useServerFn(listSubCalendarSuggestions);
  const fetchProfiles = useServerFn(listStaffProfiles);
  const createFn = useServerFn(createSubCalendar);
  const updateFn = useServerFn(updateSubCalendar);
  const deleteFn = useServerFn(deleteSubCalendar);
  const approveFn = useServerFn(approveSubCalendarSuggestion);
  const dismissFn = useServerFn(dismissSubCalendarSuggestion);
  const syncFn = useServerFn(syncServeTeamSubCalendars);

  const [rows, setRows] = useState<SubCalendarRow[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState<any | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const [list, sug, ppl] = await Promise.all([
        fetchList(),
        isCore ? fetchSuggestions().catch(() => []) : Promise.resolve([]),
        fetchProfiles(),
      ]);
      setRows(list ?? []);
      setSuggestions(sug ?? []);
      setProfiles(ppl ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { reload(); }, []);

  async function handleSync() {
    setSyncing(true);
    try {
      const res: any = await syncFn();
      if (res?.created > 0) {
        toast.success(`Created ${res.created} sub-calendar${res.created === 1 ? "" : "s"} from Serve Leaders teams.`);
      } else {
        toast.success("All Serve Leaders teams already have sub-calendars.");
      }
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  if (!isCore) {
    return (
      <div className="p-6">
        <EmptyState icon={SettingsIcon} title="Core only" description="Only Core admins can manage sub-calendars." />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold">Sub-calendars</h1>
          <p className="text-sm text-muted-foreground">Rename, recolor, and assign an owner who can add/edit events on each sub-calendar. Core admins can always edit everything.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSync} disabled={syncing} className="gap-1">
            {syncing ? "Syncing…" : "Sync from Serve Leaders"}
          </Button>
          <Button onClick={() => setNewOpen(true)} className="gap-1">
            <Plus className="w-4 h-4" /> New sub-calendar
          </Button>
        </div>
      </div>


      {suggestions.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Suggested from Serve Leaders teams</h2>
            <span className="text-xs text-muted-foreground">{suggestions.length} pending</span>
          </div>
          <ul className="divide-y divide-border">
            {suggestions.map((s) => (
              <li key={s.pco_group_id} className="py-2 flex items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{s.group_name}</div>
                  <div className="text-xs text-muted-foreground">PCO group #{s.pco_group_id}</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setApproveTarget(s)}>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await dismissFn({ data: { pco_group_id: s.pco_group_id } });
                        await reload();
                      } catch (e: any) { toast.error(e?.message ?? "Failed"); }
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="bg-surface border border-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={SettingsIcon} title="No sub-calendars" description="Create one to get started." />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <SubCalRow
                key={r.id}
                row={r}
                profiles={profiles}
                onSave={async (patch) => {
                  try {
                    await updateFn({ data: { id: r.id, ...patch } });
                    toast.success("Saved");
                    await reload();
                  } catch (e: any) { toast.error(e?.message ?? "Failed"); }
                }}
                onDelete={async () => {
                  if (!confirm(`Delete "${r.name}"?`)) return;
                  try {
                    await deleteFn({ data: { id: r.id } });
                    toast.success("Deleted");
                    await reload();
                  } catch (e: any) { toast.error(e?.message ?? "Failed"); }
                }}
              />
            ))}
          </ul>
        )}
      </section>

      <NewSubCalDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        profiles={profiles}
        onCreate={async (v) => {
          try {
            await createFn({ data: v });
            toast.success("Created");
            setNewOpen(false);
            await reload();
          } catch (e: any) { toast.error(e?.message ?? "Failed"); }
        }}
      />

      <ApproveSuggestionDialog
        suggestion={approveTarget}
        onClose={() => setApproveTarget(null)}
        profiles={profiles}
        onApprove={async (v) => {
          try {
            await approveFn({ data: v });
            toast.success("Approved");
            setApproveTarget(null);
            await reload();
          } catch (e: any) { toast.error(e?.message ?? "Failed"); }
        }}
      />
    </div>
  );
}

function SubCalRow({
  row, profiles, onSave, onDelete,
}: {
  row: SubCalendarRow;
  profiles: any[];
  onSave: (patch: Partial<SubCalendarRow>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState(row.name);
  const [color, setColor] = useState(row.color_token);
  const [owner, setOwner] = useState<string>(row.owner_user_id ?? "__none__");
  const [active, setActive] = useState(row.is_active);
  const dirty = name !== row.name || color !== row.color_token || (owner === "__none__" ? row.owner_user_id !== null : owner !== row.owner_user_id) || active !== row.is_active;

  return (
    <li className="p-3 md:p-4 flex flex-col md:flex-row md:items-center gap-3">
      <div className="flex items-center gap-2 min-w-[180px]">
        <ColorSwatch token={color} />
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
      </div>
      <div className="text-xs text-muted-foreground font-mono md:w-[9rem] truncate" title={row.key}>{row.key}</div>
      <div className="w-full md:w-auto md:max-w-[18rem]">
        <ColorPicker value={color} onChange={setColor} />
      </div>

      <Select value={owner} onValueChange={setOwner}>
        <SelectTrigger className="h-9 flex-1 md:min-w-[14rem]"><SelectValue placeholder="No owner (core only)" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">No owner (core only)</SelectItem>
          {profiles.map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.full_name} — {p.email}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2 text-xs">
        <Switch checked={active} onCheckedChange={setActive} />
        <span className="text-muted-foreground">{active ? "Active" : "Hidden"}</span>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!dirty}
          onClick={() => onSave({
            name,
            color_token: color,
            owner_user_id: owner === "__none__" ? null : owner,
            is_active: active,
          })}
        >
          Save
        </Button>
        {row.source !== "system" && (
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>
    </li>
  );
}

function NewSubCalDialog({
  open, onOpenChange, profiles, onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profiles: any[];
  onCreate: (v: any) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("var(--cal-general)");
  const [owner, setOwner] = useState<string>("__none__");
  useEffect(() => { if (!open) { setName(""); setColor("var(--cal-general)"); setOwner("__none__"); } }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New sub-calendar</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kids" />
          </div>
          <div>
            <Label>Color</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          <div>
            <Label>Owner</Label>
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger><SelectValue placeholder="No owner (core only)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No owner (core only)</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name} — {p.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!name.trim()}
            onClick={() => onCreate({
              name: name.trim(),
              color_token: color,
              owner_user_id: owner === "__none__" ? null : owner,
            })}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApproveSuggestionDialog({
  suggestion, onClose, profiles, onApprove,
}: {
  suggestion: any | null;
  onClose: () => void;
  profiles: any[];
  onApprove: (v: any) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("var(--cal-general)");
  const [owner, setOwner] = useState<string>("__none__");
  useEffect(() => {
    if (suggestion) {
      setName(suggestion.group_name ?? "");
      setColor("var(--cal-general)");
      setOwner("__none__");
    }
  }, [suggestion]);
  return (
    <Dialog open={!!suggestion} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Approve team as sub-calendar</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Sub-calendar name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Color</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          <div>
            <Label>Owner (leader who can add/edit)</Label>
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger><SelectValue placeholder="No owner (core only)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No owner (core only)</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name} — {p.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!name.trim() || !suggestion}
            onClick={() => onApprove({
              pco_group_id: suggestion.pco_group_id,
              name: name.trim(),
              color_token: color,
              owner_user_id: owner === "__none__" ? null : owner,
            })}
          >
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
