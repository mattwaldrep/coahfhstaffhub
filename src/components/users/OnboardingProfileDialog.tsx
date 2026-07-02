import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getMyProfile, completeProfileOnboarding } from "@/lib/users.functions";
import { useAuth } from "@/lib/auth-context";

/**
 * Shown once, on first login, when the user's profile has no `onboarded_at`.
 * Collects display name + optional avatar URL, then marks them onboarded.
 */
export function OnboardingProfileDialog() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await getMyProfile();
        if (cancelled) return;
        if (p && !p.onboarded_at) {
          setFullName(p.full_name ?? "");
          setAvatarUrl(p.avatar_url ?? "");
          setOpen(true);
        }
      } catch {
        // Silent — non-fatal
      }
    })();
    return () => { cancelled = true; };
  }, [loading, user]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await completeProfileOnboarding({
        data: { fullName: fullName.trim() || undefined, avatarUrl: avatarUrl.trim() || "" },
      });
      toast.success("Welcome aboard!");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function skip() {
    setSaving(true);
    try {
      await completeProfileOnboarding({ data: {} });
      setOpen(false);
    } catch {
      // no-op
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => { /* modal — must complete or skip */ }}>
      <DialogContent onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Welcome! Let's set up your profile</DialogTitle>
          <DialogDescription>
            This is what teammates will see next to your @mentions, notes, and meeting activity.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label>Display name</Label>
            <Input
              autoFocus
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
            />
          </div>
          <div className="space-y-2">
            <Label>Avatar URL <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={skip} disabled={saving}>Skip for now</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save & continue"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
