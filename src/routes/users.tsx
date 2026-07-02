import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { Plus, ShieldAlert, Users as UsersIcon, Search, ChevronRight } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { listUsers, inviteUser, bulkInviteUsers } from "@/lib/users.functions";
import { UserEditDrawer, type UserRow } from "@/components/users/UserEditDrawer";

export const Route = createFileRoute("/users")({
  component: UsersPage,
});

const ROLE_OPTIONS = [
  { value: "core", label: "Staff Pastor", desc: "Full admin: manage everything + invite users" },
  { value: "meeting", label: "Meeting", desc: "Staff meeting + Sunday Review access" },
  { value: "extended", label: "Extended", desc: "Read-only across most modules" },
] as const;

type Role = typeof ROLE_OPTIONS[number]["value"];

type HubFilter = "all" | "core" | "meeting" | "extended" | "elder" | "deacon" | "cg_coach" | "serve_leader_admin";

const HUB_FILTERS: { value: HubFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "core", label: "Staff Pastors" },
  { value: "meeting", label: "Meeting" },
  { value: "extended", label: "Extended" },
  { value: "elder", label: "Elder Hub" },
  { value: "deacon", label: "Deacons" },
  { value: "cg_coach", label: "CG Coaches" },
  { value: "serve_leader_admin", label: "Serve Leaders" },
];

function UsersPage() {
  return <AppShell><Body /></AppShell>;
}

function Body() {
  const { hasRole, user, loading: authLoading } = useAuth();
  const isCore = hasRole("core");
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<HubFilter>("all");
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
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
      setRows(data as UserRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const hay = `${r.full_name ?? ""} ${r.email ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter === "all") return true;
      if (filter === "elder") return r.roles.includes("elder") || r.roles.includes("elder_candidate");
      if (filter === "deacon") return r.roles.includes("deacon") || r.roles.includes("chair_of_deacons");
      return r.roles.includes(filter);
    });
  }, [rows, query, filter]);

  const counts = useMemo(() => {
    const c: Record<HubFilter, number> = {
      all: rows.length, core: 0, meeting: 0, extended: 0, elder: 0, deacon: 0, cg_coach: 0, serve_leader_admin: 0,
    };
    rows.forEach((r) => {
      if (r.roles.includes("core")) c.core++;
      if (r.roles.includes("meeting")) c.meeting++;
      if (r.roles.includes("extended")) c.extended++;
      if (r.roles.includes("elder") || r.roles.includes("elder_candidate")) c.elder++;
      if (r.roles.includes("deacon") || r.roles.includes("chair_of_deacons")) c.deacon++;
      if (r.roles.includes("cg_coach")) c.cg_coach++;
      if (r.roles.includes("serve_leader_admin")) c.serve_leader_admin++;
    });
    return c;
  }, [rows]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    try {
      const result = await inviteUser({ data: { email, role, fullName: fullName || undefined } });
      if ((result as { alreadyExisted?: boolean })?.alreadyExisted) {
        toast.success(`${email} already had an account — role updated to ${role}.`);
      } else {
        toast.success(`Invite sent to ${email}`);
      }
      setInviteOpen(false);
      setEmail(""); setFullName(""); setRole("extended");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to invite");
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
        let em = "";
        let fn: string | undefined;
        const angle = line.match(/^(.*)<\s*([^>\s]+)\s*>\s*$/);
        if (angle) {
          fn = angle[1].trim().replace(/^["']|["']$/g, "") || undefined;
          em = angle[2].trim();
        } else {
          const m = line.match(/[^\s<>,;]+@[^\s<>,;]+\.[^\s<>,;]+/);
          if (m) {
            em = m[0];
            const rest = line.replace(em, "").replace(/[,;]/g, " ").trim();
            if (rest) fn = rest;
          }
        }
        const lower = em.toLowerCase();
        if (em && !seen.has(lower)) {
          seen.add(lower);
          out.push({ email: em, fullName: fn });
        }
      });
    return out;
  }

  async function submitBulk(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseBulkEmails(bulkText);
    if (parsed.length === 0) { toast.error("No valid emails found"); return; }
    setBulkSubmitting(true);
    try {
      const { results } = await bulkInviteUsers({ data: { invites: parsed.map((p) => ({ ...p, role: bulkRole })) } });
      const invited = results.filter((r) => r.status === "invited").length;
      const updated = results.filter((r) => r.status === "updated").length;
      const errored = results.filter((r) => r.status === "error");
      if (invited || updated) toast.success(`${invited} invited, ${updated} updated${errored.length ? `, ${errored.length} failed` : ""}`);
      errored.forEach((r) => toast.error(`${r.email}: ${r.message ?? "Failed"}`));
      if (errored.length === 0) { setBulkOpen(false); setBulkText(""); setBulkRole("extended"); }
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk invite failed");
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
        <p className="text-sm text-muted-foreground">Ask a core admin to grant you access to user management.</p>
        <Button asChild variant="outline" size="sm"><Link to="/">Back home</Link></Button>
      </div>
    );
  }

  const activeRow = rows.find((r) => r.id === drawerId) ?? null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Users &amp; roles</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Click any user to edit their access. {rows.length} total.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
            <UsersIcon className="w-4 h-4 mr-1.5" /> Bulk invite
          </Button>
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Invite user
          </Button>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center gap-3 p-3 border-b border-border">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-8 h-9"
              placeholder="Search name or email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {HUB_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`text-xs px-2.5 py-1 rounded-full border transition ${
                  filter === f.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted"
                }`}
              >
                {f.label} <span className="opacity-60">{counts[f.value]}</span>
              </button>
            ))}
          </div>
        </div>

        {loading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
        {!loading && filtered.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">No users match.</div>
        )}
        <ul className="divide-y divide-border">
          {filtered.map((r) => {
            const staffRole = r.roles.find((x) => ["core", "meeting", "extended"].includes(x)) ?? "extended";
            const isSelf = r.id === user?.id;
            return (
              <li key={r.id}>
                <button
                  onClick={() => setDrawerId(r.id)}
                  className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-background/50 transition"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-medium shrink-0">
                    {(r.full_name ?? r.email ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{r.full_name ?? "—"}</span>
                      {isSelf && <span className="text-[10px] text-muted-foreground">(you)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                  </div>
                  <div className="hidden md:flex flex-wrap gap-1 max-w-[45%] justify-end">
                    <RoleChip label={ROLE_OPTIONS.find((o) => o.value === staffRole)?.label ?? staffRole} tone="primary" />
                    {r.roles.includes("elder") && <RoleChip label="Elder" tone="amber" />}
                    {r.roles.includes("elder_candidate") && <RoleChip label="Elder candidate" tone="amber" />}
                    {r.roles.includes("chair_of_deacons") && <RoleChip label="Chair of Deacons" tone="blue" />}
                    {r.roles.includes("deacon") && !r.roles.includes("chair_of_deacons") && <RoleChip label="Deacon" tone="blue" />}
                    {r.roles.includes("cg_coach") && <RoleChip label="CG Coach" tone="emerald" />}
                    {r.roles.includes("serve_leader_admin") && <RoleChip label="Serve Leaders" tone="violet" />}
                  </div>
                  <div className="text-[11px] text-muted-foreground text-right shrink-0 hidden sm:block ml-2 min-w-[110px]">
                    <div>Joined {format(new Date(r.created_at), "MMM d, yyyy")}</div>
                    <div>
                      {r.last_sign_in_at
                        ? `Last ${format(new Date(r.last_sign_in_at), "MMM d, yyyy")}`
                        : "Never signed in"}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <UserEditDrawer
        row={activeRow}
        open={drawerId !== null}
        onOpenChange={(v) => { if (!v) setDrawerId(null); }}
        isSelf={activeRow?.id === user?.id}
        onChanged={load}
        onRemoved={load}
      />

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite a user</DialogTitle></DialogHeader>
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
              <Label>Starting staff tier</Label>
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
              <p className="text-xs text-muted-foreground">You can grant Elder / Deacon / Hub access after they show up in the list.</p>
            </div>
            <DialogFooter><Button type="submit">Send invite</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bulk invite users</DialogTitle></DialogHeader>
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
              <Label>Starting staff tier (applied to all)</Label>
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

function RoleChip({ label, tone }: { label: string; tone: "primary" | "amber" | "blue" | "emerald" | "violet" }) {
  const map: Record<string, string> = {
    primary: "bg-primary/10 text-primary border-primary/20",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    blue: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    violet: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${map[tone]}`}>{label}</span>
  );
}
