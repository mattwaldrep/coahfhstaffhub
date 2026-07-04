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
  type SubCalendarRow,
} from "@/lib/sub-calendars.functions";

export const Route = createFileRoute("/calendar_/settings")({
  component: () => (
    <AppShell>
      <SettingsPage />
    </AppShell>
  ),
});

const COLOR_TOKENS = [
  { value: "var(--cal-main)", label: "Blue (General)" },
  { value: "var(--cal-lm)", label: "COAH:LM" },
  { value: "var(--cal-youth)", label: "Youth" },
  { value: "var(--cal-missions)", label: "Missions" },
  { value: "var(--cal-general)", label: "Neutral" },
];

function ColorSwatch({ token }: { token: string }) {
  return (
    <span
      className="inline-block w-4 h-4 rounded"
      style={{ background: token, border: "1px solid var(--border)" }}
    />
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

  const [rows, setRows] = useState<SubCalendarRow[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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

  if (!isCore) {
    return (
      <div className="p-6">
        <EmptyState icon={SettingsIcon} title="Core only" description="Only Core admins can manage sub-calendars." />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Sub-calendars</h1>
          <p className="text-sm text-muted-foreground">Rename, recolor, and assign an owner who can add/edit events on each sub-calendar. Core admins can always edit everything.</p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="gap-1">
          <Plus className="w-4 h-4" /> New sub-calendar
        </Button>
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
      <Select value={color} onValueChange={setColor}>
        <SelectTrigger className="h-9 w-[10rem]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {COLOR_TOKENS.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              <span className="flex items-center gap-2"><ColorSwatch token={c.value} /> {c.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
            <Select value={color} onValueChange={setColor}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COLOR_TOKENS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    <span className="flex items-center gap-2"><ColorSwatch token={c.value} /> {c.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Select value={color} onValueChange={setColor}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COLOR_TOKENS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    <span className="flex items-center gap-2"><ColorSwatch token={c.value} /> {c.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
