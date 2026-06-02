import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, ExternalLink, Plug, Unplug, Mail, Bell, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getGoogleAuthUrl, getGoogleConnection, disconnectGoogle, setGoogleAutoPush } from "@/lib/google-tasks.functions";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  validateSearch: (s: Record<string, unknown>) => ({
    google: typeof s.google === "string" ? s.google : undefined,
    msg: typeof s.msg === "string" ? s.msg : undefined,
  }),
});

function SettingsPage() {
  const { user, roles } = useAuth();
  const [fullName, setFullName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setFullName(data?.full_name ?? ""));
  }, [user]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() || null })
      .eq("id", user.id);
    setSavingProfile(false);
    if (error) toast.error(error.message);
    else toast.success("Profile updated");
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw1.length < 6) return toast.error("Password must be at least 6 characters");
    if (pw1 !== pw2) return toast.error("Passwords don't match");
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setSavingPw(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Password updated");
      setPw1(""); setPw2("");
    }
  }

  return (
    <AppShell>
      <h1 className="text-3xl font-display font-bold">Settings</h1>

      <div className="mt-8 grid gap-6 max-w-2xl">
        <form onSubmit={saveProfile} className="bg-surface border border-border rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="font-display font-semibold">Your profile</h2>
            <p className="text-xs text-muted-foreground mt-1">Update your display name. Email and role are managed by core admins.</p>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Email</dt>
              <dd>{user?.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Role</dt>
              <dd className="font-medium capitalize">{roles.join(", ") || "—"}</dd>
            </div>
          </dl>
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={savingProfile}>
              {savingProfile && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save profile
            </Button>
          </div>
        </form>

        <form onSubmit={changePassword} className="bg-surface border border-border rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="font-display font-semibold">Change password</h2>
            <p className="text-xs text-muted-foreground mt-1">At least 6 characters.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pw1">New password</Label>
            <Input id="pw1" type="password" minLength={6} value={pw1} onChange={(e) => setPw1(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pw2">Confirm new password</Label>
            <Input id="pw2" type="password" minLength={6} value={pw2} onChange={(e) => setPw2(e.target.value)} required />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={savingPw || !pw1 || !pw2}>
              {savingPw && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Update password
            </Button>
          </div>
        </form>

        <GoogleTasksCard />
        {roles.includes("core") && <WeeklyDigestCard />}
        {roles.includes("core") && <NudgesCard />}
      </div>
    </AppShell>
  );
}

function WeeklyDigestCard() {
  const [busy, setBusy] = useState(false);
  async function sendNow() {
    setBusy(true);
    try {
      const res = await fetch("/api/public/hooks/send-weekly-digest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
        },
        body: "{}",
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text);
      toast.success("Digest sent", { description: text });
    } catch (e: any) {
      toast.error("Couldn't send digest", { description: e.message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="bg-surface border border-border rounded-2xl p-6 space-y-3">
      <div>
        <h2 className="font-display font-semibold flex items-center gap-2"><Mail className="w-4 h-4" /> Weekly staff digest</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Sent automatically to staff every Sunday at 7pm. Includes upcoming events, gaps to close, and open action items.
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={sendNow} disabled={busy}>
        {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Send digest now
      </Button>
    </div>
  );
}

type Nudge = {
  id: string;
  role: "core" | "meeting" | "extended" | "elder" | "elder_candidate";
  section: string;
  active: boolean;
};

function NudgesCard() {
  const [items, setItems] = useState<Nudge[] | null>(null);
  const [role, setRole] = useState<Nudge["role"]>("core");
  const [section, setSection] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("sunday_review_nudges")
      .select("id, role, section, active")
      .order("role");
    setItems((data ?? []) as Nudge[]);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!section.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("sunday_review_nudges").insert({ role, section: section.trim() });
    setBusy(false);
    if (error) return toast.error(error.message);
    setSection("");
    load();
  }
  async function toggle(n: Nudge, active: boolean) {
    setItems((list) => list?.map((x) => x.id === n.id ? { ...x, active } : x) ?? null);
    await supabase.from("sunday_review_nudges").update({ active }).eq("id", n.id);
  }
  async function remove(n: Nudge) {
    setItems((list) => list?.filter((x) => x.id !== n.id) ?? null);
    await supabase.from("sunday_review_nudges").delete().eq("id", n.id);
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
      <div>
        <h2 className="font-display font-semibold flex items-center gap-2"><Bell className="w-4 h-4" /> Sunday Review nudges</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Decide which roles own which Sunday Review sections. Owners get a line in the weekly digest reminding them their section is due.
        </p>
      </div>

      {items === null ? (
        <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState
          compact
          icon={Bell}
          title="No nudges yet"
          description="Add the first one below — e.g. Worship team owns the Worship section."
        />
      ) : (
        <ul className="divide-y divide-border text-sm">
          {items.map((n) => (
            <li key={n.id} className="flex items-center gap-3 py-2">
              <span className="text-xs font-medium capitalize w-24 text-muted-foreground">{n.role}</span>
              <span className="flex-1 truncate">{n.section}</span>
              <Switch checked={n.active} onCheckedChange={(v) => toggle(n, v)} />
              <Button size="icon" variant="ghost" onClick={() => remove(n)} aria-label="Remove">
                <Trash2 className="w-4 h-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2 items-end border-t border-border pt-3">
        <div className="space-y-1">
          <Label className="text-xs">Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as Nudge["role"])}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["core","meeting","extended","elder","elder_candidate"].map((r) => (
                <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Section</Label>
          <Input value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. Worship notes" />
        </div>
        <Button onClick={add} disabled={busy || !section.trim()}>Add</Button>
      </div>
    </div>
  );
}

function GoogleTasksCard() {
  const search = useSearch({ from: "/settings" });
  const getUrl = useServerFn(getGoogleAuthUrl);
  const getConn = useServerFn(getGoogleConnection);
  const disconnect = useServerFn(disconnectGoogle);
  const setAutoPush = useServerFn(setGoogleAutoPush);
  const [conn, setConn] = useState<{ connected: boolean; updated_at?: string; auto_push?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);

  async function toggleAutoPush(v: boolean) {
    setAutoBusy(true);
    try {
      await setAutoPush({ data: { autoPush: v } });
      setConn((c) => (c ? { ...c, auto_push: v } : c));
      toast.success(v ? "Auto-send enabled" : "Auto-send disabled");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update");
    } finally {
      setAutoBusy(false);
    }
  }

  useEffect(() => {
    getConn().then((r: any) => setConn(r)).catch(() => setConn({ connected: false }));
  }, [getConn]);

  useEffect(() => {
    if (search.google === "connected") toast.success("Google Tasks connected");
    if (search.google === "error") toast.error(`Google connection failed: ${search.msg ?? ""}`);
  }, [search.google, search.msg]);

  async function connect() {
    setBusy(true);
    try {
      const { url } = await getUrl({ data: { origin: window.location.origin } });
      window.location.href = url;
    } catch (e: any) {
      toast.error(e.message ?? "Failed to start OAuth");
      setBusy(false);
    }
  }
  async function unlink() {
    setBusy(true);
    try {
      await disconnect();
      setConn({ connected: false });
      toast.success("Google Tasks disconnected");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
      <div>
        <h2 className="font-display font-semibold flex items-center gap-2">
          Google Tasks
          {conn?.connected && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Connect your Google account so action items assigned to you can be pushed straight into your Google Tasks list.
        </p>
      </div>
      {conn === null ? (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" /> Checking…
        </div>
      ) : conn.connected ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm text-muted-foreground">Connected. Tasks push to your default list.</span>
            <Button variant="outline" size="sm" onClick={unlink} disabled={busy}>
              <Unplug className="w-4 h-4 mr-1.5" /> Disconnect
            </Button>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <div>
              <div className="text-sm font-medium">Auto-send on assignment</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                When a task is assigned to you, send it to your Google Tasks immediately.
              </p>
            </div>
            <Switch
              checked={!!conn.auto_push}
              onCheckedChange={toggleAutoPush}
              disabled={autoBusy}
            />
          </div>
        </div>
      ) : (
        <Button onClick={connect} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plug className="w-4 h-4 mr-2" />}
          Connect Google Tasks
        </Button>
      )}
      <div className="text-[11px] text-muted-foreground border-t border-border pt-3">
        Your refresh token is encrypted at rest and only used to push tasks you've been assigned. Disconnect any time.
        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer" className="ml-1 underline inline-flex items-center gap-0.5">
          Manage Google access <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>
    </div>
  );
}
