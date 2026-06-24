import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Megaphone } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/comms-channels")({ component: CommsChannelsPage });

const LISTING_CHANNELS = [
  { key: "pco", label: "PCO Registrations" },
  { key: "eventbrite", label: "Eventbrite" },
  { key: "google", label: "Google My Business" },
  { key: "community_cals", label: "Community Cals" },
  { key: "socials", label: "Socials" },
  { key: "social_ads", label: "Social Ads" },
];

const COMMS_CHANNELS = [
  { key: "direct_email", label: "Direct Email" },
  { key: "push_notification", label: "Push Notification" },
  { key: "sunday_slide", label: "ProPresenter Slide" },
  { key: "sunday_announcement", label: "Sunday Announcement" },
  { key: "ministry_highlight", label: "Ministry Highlight" },
  { key: "newsletter", label: "Newsletter" },
  { key: "text_message", label: "Text Message" },
];

const UNASSIGNED = "__none__";

type Profile = { id: string; full_name: string | null; email: string | null };

function CommsChannelsPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("core");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [managers, setManagers] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [{ data: profs }, { data: rows }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email").order("full_name"),
      supabase.from("comms_channel_managers" as any).select("channel_key, manager_id"),
    ]);
    setProfiles((profs ?? []) as Profile[]);
    const map: Record<string, string | null> = {};
    for (const r of (rows ?? []) as unknown as Array<{ channel_key: string; manager_id: string | null }>) {
      map[r.channel_key] = r.manager_id;
    }
    setManagers(map);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function setManager(channelKey: string, managerId: string | null) {
    setManagers((m) => ({ ...m, [channelKey]: managerId }));
    const { error } = await supabase
      .from("comms_channel_managers" as any)
      .upsert(
        { channel_key: channelKey, manager_id: managerId },
        { onConflict: "channel_key" },
      );
    if (error) {
      toast.error(error.message);
      load();
    } else {
      toast.success("Manager updated");
    }
  }

  function renderRow(c: { key: string; label: string }) {
    const current = managers[c.key] ?? null;
    return (
      <div key={c.key} className="flex items-center justify-between gap-4 py-2 border-b last:border-b-0">
        <Label className="text-sm">{c.label}</Label>
        <div className="w-64">
          <Select
            value={current ?? UNASSIGNED}
            onValueChange={(v) => canEdit && setManager(c.key, v === UNASSIGNED ? null : v)}
            disabled={!canEdit}
          >
            <SelectTrigger>
              <SelectValue placeholder="No manager" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>No manager</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name || p.email || "Unnamed"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
        <header className="flex items-center gap-3">
          <Megaphone className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-display font-bold">Comms Channels</h1>
            <p className="text-sm text-muted-foreground">
              Assign a manager to each listing and communications channel. When a channel is toggled on for an event, the auto-generated task is assigned to that manager.
            </p>
          </div>
        </header>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <Card>
              <CardHeader><CardTitle className="text-base">Listing channels</CardTitle></CardHeader>
              <CardContent>{LISTING_CHANNELS.map(renderRow)}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Communications channels</CardTitle></CardHeader>
              <CardContent>{COMMS_CHANNELS.map(renderRow)}</CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
