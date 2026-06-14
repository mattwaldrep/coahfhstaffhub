import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ShieldAlert, Users as UsersIcon } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  listUsers, setUserRole, inviteUser, removeUser, setUserElderTier, bulkInviteUsers, setUserCgCoach, setUserDeaconTier,
} from "@/lib/users.functions";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/users")({
  component: UsersPage,
});

const ROLE_OPTIONS = [
  { value: "core", label: "Core", desc: "Full admin: manage everything + invite users" },
  { value: "meeting", label: "Meeting", desc: "Staff meeting + Sunday Review access" },
  { value: "extended", label: "Extended", desc: "Read-only across most modules" },
] as const;

const ELDER_OPTIONS = [
  { value: "none", label: "—" },
  { value: "elder_candidate", label: "Candidate" },
  { value: "elder", label: "Full Elder" },
] as const;

const DEACON_OPTIONS = [
  { value: "none", label: "—" },
  { value: "deacon", label: "Deacon" },
  { value: "chair_of_deacons", label: "Chair of Deacons" },
] as const;

type Role = typeof ROLE_OPTIONS[number]["value"];
type ElderTier = typeof ELDER_OPTIONS[number]["value"];
type DeaconTier = typeof DEACON_OPTIONS[number]["value"];

type Row = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  roles: string[];
};

function UsersPage() {
  return <AppShell><Body /></AppShell>;
}

function Body() {
  const { hasRole, user, loading: authLoading } = useAuth();
  const isCore = hasRole("core");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkRole, setBulkRole] = useState<Role>("extended");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("extended");

  useEffect(() => {
    if (!authLoading && isCore) load();
  }, [authLoading, isCore]);

  async function load() {
    setLoading(true);
    try {
      const data = await listUsers();
      setRows(data as Row[]);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  async function changeRole(userId: string, newRole: Role) {
    try {
      await setUserRole({ data: { userId, role: newRole } });
      toast.success("Role updated");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  }

  async function changeElderTier(userId: string, tier: ElderTier) {
    try {
      await setUserElderTier({ data: { userId, tier } });
      toast.success("Elder tier updated");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  }

  async function changeDeaconTier(userId: string, tier: DeaconTier) {
    try {
      await setUserDeaconTier({ data: { userId, tier } });
      toast.success("Deacon tier updated");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  }

  async function toggleCgCoach(userId: string, enabled: boolean) {
    try {
      await setUserCgCoach({ data: { userId, enabled } });
      toast.success(enabled ? "Tagged as CG Coach" : "Removed CG Coach tag");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    try {
      const result = await inviteUser({ data: { email, role, fullName: fullName || undefined } });
      if ((result as any)?.alreadyExisted) {
        toast.success(`${email} already had an account — role updated to ${role}.`);
      } else {
        toast.success(`Invite sent to ${email}`);
      }
      setOpen(false);
      setEmail(""); setFullName(""); setRole("extended");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to invite");
    }
  }

  async function remove(row: Row) {
    if (!confirm(`Remove ${row.email}? This deletes their account.`)) return;
    try {
      await removeUser({ data: { userId: row.id } });
      toast.success("User removed");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  }

  function parseBulkEmails(text: string): { email: string; fullName?: string }[] {
    const out: { email: string; fullName?: string }[] = [];
    const seen = new Set<string>();
    text
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((line) => {
        // Accept formats: "email", "Name <email>", "Name, email", "email Name"
        let email = "";
        let fullName: string | undefined;
        const angle = line.match(/^(.*)<\s*([^>\s]+)\s*>\s*$/);
        if (angle) {
          fullName = angle[1].trim().replace(/^["']|["']$/g, "") || undefined;
          email = angle[2].trim();
        } else {
          const m = line.match(/[^\s<>,;]+@[^\s<>,;]+\.[^\s<>,;]+/);
          if (m) {
            email = m[0];
            const rest = line.replace(email, "").replace(/[,;]/g, " ").trim();
            if (rest) fullName = rest;
          }
        }
        const lower = email.toLowerCase();
        if (email && !seen.has(lower)) {
          seen.add(lower);
          out.push({ email, fullName });
        }
      });
    return out;
  }

  async function submitBulk(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseBulkEmails(bulkText);
    if (parsed.length === 0) {
      toast.error("No valid emails found");
      return;
    }
    setBulkSubmitting(true);
    try {
      const { results } = await bulkInviteUsers({
        data: { invites: parsed.map((p) => ({ ...p, role: bulkRole })) },
      });
      const invited = results.filter((r) => r.status === "invited").length;
      const updated = results.filter((r) => r.status === "updated").length;
      const errored = results.filter((r) => r.status === "error");
      if (invited || updated) {
        toast.success(`${invited} invited, ${updated} updated${errored.length ? `, ${errored.length} failed` : ""}`);
      }
      errored.forEach((r) => toast.error(`${r.email}: ${r.message ?? "Failed"}`));
      if (errored.length === 0) {
        setBulkOpen(false);
        setBulkText("");
        setBulkRole("extended");
      }
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Bulk invite failed");
    } finally {
      setBulkSubmitting(false);
    }
  }


  if (authLoading) return null;

  if (!isCore) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-3">
        <ShieldAlert className="w-10 h-10 mx-auto text-muted-foreground" />
        <h1 className="text-xl font-display font-semibold">Core access only</h1>
        <p className="text-sm text-muted-foreground">
          Ask a core admin to grant you access to user management.
        </p>
        <Button asChild variant="outline" size="sm"><Link to="/">Back home</Link></Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Users & roles</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Invite teammates and assign access tiers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
            <UsersIcon className="w-4 h-4 mr-1.5" /> Bulk invite
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Invite user
          </Button>
        </div>
      </div>




      <div className="overflow-x-auto">
        <div className="bg-surface border border-border rounded-2xl overflow-hidden min-w-[720px]">
          <div className="grid grid-cols-12 px-4 py-2 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
            <div className="col-span-4">User</div>
            <div className="col-span-2">Role</div>
            <div className="col-span-2">Elder access</div>
            <div className="col-span-1">CG Coach</div>
            <div className="col-span-2">Joined</div>
            <div className="col-span-1 text-right">·</div>
          </div>
          {loading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
          {!loading && rows.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground">No users yet.</div>
          )}
          {rows.map((r) => {
            const staffRole = (r.roles.find((x) => ["core","meeting","extended"].includes(x)) ?? "extended") as Role;
            const elderTier: ElderTier = r.roles.includes("elder")
              ? "elder"
              : r.roles.includes("elder_candidate")
              ? "elder_candidate"
              : "none";
            const isCg = r.roles.includes("cg_coach");
            const isSelf = r.id === user?.id;
            return (
              <div key={r.id} className="grid grid-cols-12 items-center px-4 py-3 border-b border-border last:border-0 hover:bg-background/40">
                <div className="col-span-4 flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-medium shrink-0">
                    {(r.full_name ?? r.email ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {r.full_name ?? "—"} {isSelf && <span className="text-[10px] text-muted-foreground">(you)</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">{r.email}</div>
                  </div>
                </div>
                <div className="col-span-2 pr-2">
                  <Select value={staffRole} onValueChange={(v) => changeRole(r.id, v as Role)}>
                    <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 pr-2">
                  <Select value={elderTier} onValueChange={(v) => changeElderTier(r.id, v as ElderTier)}>
                    <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ELDER_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-1">
                  <Checkbox
                    checked={isCg}
                    onCheckedChange={(v) => toggleCgCoach(r.id, !!v)}
                    aria-label="CG Coach"
                  />
                </div>
                <div className="col-span-2 text-xs text-muted-foreground">
                  {format(new Date(r.created_at), "MMM d, yyyy")}
                </div>
                <div className="col-span-1 flex justify-end">
                  {!isSelf && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(r)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        {ROLE_OPTIONS.map((o) => (
          <div key={o.value} className="bg-surface border border-border rounded-xl p-4">
            <div className="text-sm font-medium capitalize">{o.label}</div>
            <div className="text-xs text-muted-foreground mt-1">{o.desc}</div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a user</DialogTitle>
          </DialogHeader>
          <form onSubmit={invite} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Full name (optional)</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="font-medium">{o.label}</span>
                      <span className="text-xs text-muted-foreground ml-2">{o.desc}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit">Send invite</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk invite users</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitBulk} className="space-y-4">
            <div className="space-y-2">
              <Label>Emails</Label>
              <Textarea
                rows={8}
                required
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={`One per line, or comma-separated. Optional name:\njane@example.com\nJohn Doe <john@example.com>\nmary@example.com, Mary Smith`}
              />
              <p className="text-xs text-muted-foreground">
                {parseBulkEmails(bulkText).length} valid email{parseBulkEmails(bulkText).length === 1 ? "" : "s"} detected.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Role (applied to all)</Label>
              <Select value={bulkRole} onValueChange={(v) => setBulkRole(v as Role)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="font-medium">{o.label}</span>
                      <span className="text-xs text-muted-foreground ml-2">{o.desc}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={bulkSubmitting}>
                {bulkSubmitting ? "Sending…" : "Send invites"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>

  );
}
