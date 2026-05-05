import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
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
      </div>
    </AppShell>
  );
}
