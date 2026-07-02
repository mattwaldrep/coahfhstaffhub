import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import {
  setUserRole, setUserElderTier, setUserDeaconTier, setUserCgCoach,
  setUserServeLeaderAdmin, removeUser,
} from "@/lib/users.functions";

export type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  roles: string[];
};

type StaffTier = "core" | "meeting" | "extended";
type ElderTier = "none" | "elder_candidate" | "elder";
type DeaconTier = "none" | "deacon" | "chair_of_deacons";

const STAFF_TIERS: { value: StaffTier; label: string; desc: string }[] = [
  { value: "core", label: "Staff Pastor (Core)", desc: "Full admin. Manages users, finance, elder settings, everything." },
  { value: "meeting", label: "Meeting", desc: "Staff meeting, Sunday Review, and most day-to-day modules." },
  { value: "extended", label: "Extended", desc: "Read-only across most modules. Default for new invites." },
];

const ELDER_TIERS: { value: ElderTier; label: string; desc: string }[] = [
  { value: "none", label: "Not on the elder team", desc: "No Elder Hub access." },
  { value: "elder_candidate", label: "Elder Candidate", desc: "Elder Hub access minus executive session." },
  { value: "elder", label: "Full Elder", desc: "Full Elder Hub access, including executive session and motions." },
];

const DEACON_TIERS: { value: DeaconTier; label: string; desc: string }[] = [
  { value: "none", label: "Not a deacon", desc: "No deacon access." },
  { value: "deacon", label: "Deacon", desc: "Joint deacon/elder meeting access." },
  { value: "chair_of_deacons", label: "Chair of Deacons", desc: "Can manage joint deacon/elder meeting sections." },
];

export function UserEditDrawer({
  row, open, onOpenChange, isSelf, onChanged, onRemoved,
}: {
  row: UserRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isSelf: boolean;
  onChanged: () => void;
  onRemoved: () => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  if (!row) return null;

  const staffTier: StaffTier =
    (row.roles.find((r) => ["core", "meeting", "extended"].includes(r)) as StaffTier) ?? "extended";
  const elderTier: ElderTier = row.roles.includes("elder")
    ? "elder"
    : row.roles.includes("elder_candidate")
    ? "elder_candidate"
    : "none";
  const deaconTier: DeaconTier = row.roles.includes("chair_of_deacons")
    ? "chair_of_deacons"
    : row.roles.includes("deacon")
    ? "deacon"
    : "none";
  const isCgCoach = row.roles.includes("cg_coach");
  const isServeLeader = row.roles.includes("serve_leader_admin");

  async function run(key: string, fn: () => Promise<unknown>, msg: string) {
    setSaving(key);
    try {
      await fn();
      toast.success(msg);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{row.full_name ?? row.email}</SheetTitle>
            <SheetDescription className="text-xs">
              {row.email} · Joined {format(new Date(row.created_at), "MMM d, yyyy")}
              {row.last_sign_in_at ? ` · Last login ${format(new Date(row.last_sign_in_at), "MMM d, yyyy")}` : " · Never signed in"}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-8">
            <Section title="Staff tier" hint="Everyone gets exactly one.">
              <RadioGroup
                value={staffTier}
                onValueChange={(v) =>
                  run("staff", () => setUserRole({ data: { userId: row.id, role: v as StaffTier } }), "Staff tier updated")
                }
                className="space-y-2"
              >
                {STAFF_TIERS.map((o) => (
                  <TierOption key={o.value} value={o.value} label={o.label} desc={o.desc} disabled={saving !== null} />
                ))}
              </RadioGroup>
            </Section>

            <Section title="Elder track" hint="Grants Elder Hub access.">
              <RadioGroup
                value={elderTier}
                onValueChange={(v) =>
                  run("elder", () => setUserElderTier({ data: { userId: row.id, tier: v as ElderTier } }), "Elder tier updated")
                }
                className="space-y-2"
              >
                {ELDER_TIERS.map((o) => (
                  <TierOption key={o.value} value={o.value} label={o.label} desc={o.desc} disabled={saving !== null} />
                ))}
              </RadioGroup>
            </Section>

            <Section title="Deacon track" hint="Also grants Elder Hub access (limited to meetings).">
              <RadioGroup
                value={deaconTier}
                onValueChange={(v) =>
                  run("deacon", () => setUserDeaconTier({ data: { userId: row.id, tier: v as DeaconTier } }), "Deacon tier updated")
                }
                className="space-y-2"
              >
                {DEACON_TIERS.map((o) => (
                  <TierOption key={o.value} value={o.value} label={o.label} desc={o.desc} disabled={saving !== null} />
                ))}
              </RadioGroup>
            </Section>

            <Section title="Additional hubs" hint="Independent, on top of staff tier.">
              <ToggleRow
                label="CG Coach"
                desc="Grants access to the CG Coaching Hub."
                checked={isCgCoach}
                disabled={saving !== null}
                onChange={(v) =>
                  run("cg", () => setUserCgCoach({ data: { userId: row.id, enabled: v } }), v ? "Tagged as CG Coach" : "Removed CG Coach tag")
                }
              />
              <ToggleRow
                label="Serve Team Leaders admin"
                desc="Grants access to the Serve Team Leaders Hub."
                checked={isServeLeader}
                disabled={saving !== null}
                onChange={(v) =>
                  run("serve", () => setUserServeLeaderAdmin({ data: { userId: row.id, enabled: v } }), v ? "Granted Serve Team Leaders access" : "Revoked Serve Team Leaders access")
                }
              />
            </Section>

            {!isSelf && (
              <div className="pt-4 border-t border-border">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Danger zone</Label>
                <Button
                  variant="destructive"
                  size="sm"
                  className="mt-2"
                  onClick={() => setConfirmRemove(true)}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" /> Remove user
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {row.full_name ?? row.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes their account and revokes all access. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await removeUser({ data: { userId: row.id } });
                  toast.success("User removed");
                  setConfirmRemove(false);
                  onOpenChange(false);
                  onRemoved();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed");
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3">
        <div className="text-sm font-medium">{title}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function TierOption({ value, label, desc, disabled }: { value: string; label: string; desc: string; disabled: boolean }) {
  return (
    <label className={`flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 ${disabled ? "opacity-60 pointer-events-none" : ""}`}>
      <RadioGroupItem value={value} className="mt-0.5" />
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </label>
  );
}

function ToggleRow({ label, desc, checked, disabled, onChange }: {
  label: string; desc: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 mb-2">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
