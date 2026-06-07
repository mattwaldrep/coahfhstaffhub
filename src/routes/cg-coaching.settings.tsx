import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert, Save } from "lucide-react";
import { toast } from "sonner";
import {
  getCgConfig, saveCgConfig, listPcoGroupTypes,
} from "@/lib/cg-coaching.functions";

export const Route = createFileRoute("/cg-coaching/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <AppShell>
      <Body />
    </AppShell>
  );
}

function Body() {
  const { isCgCoach, loading: authLoading } = useAuth();
  const [types, setTypes] = useState<{ id: string; name: string }[]>([]);
  const [groupTypeId, setGroupTypeId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isCgCoach) return;
    (async () => {
      try {
        const [cfg, ts] = await Promise.all([
          (getCgConfig as any)(),
          (listPcoGroupTypes as any)(),
        ]);
        setTypes((ts ?? []) as any);
        setGroupTypeId(cfg?.group_type_id ?? "");
      } catch (e: any) {
        toast.error(e.message ?? "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [isCgCoach]);

  async function save() {
    if (!groupTypeId) return;
    setSaving(true);
    try {
      await saveCgConfig({ data: { group_type_id: groupTypeId } });
      toast.success("Saved");
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) return null;
  if (!isCgCoach) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-3">
        <ShieldAlert className="w-10 h-10 mx-auto text-muted-foreground" />
        <h1 className="text-xl font-display font-semibold">CG Coach access only</h1>
        <Button asChild variant="outline" size="sm"><Link to="/">Back home</Link></Button>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">CG Coaching settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Pick the Planning Center Group Type that contains your community groups.
        </p>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Group type</label>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <Select value={groupTypeId} onValueChange={setGroupTypeId}>
              <SelectTrigger><SelectValue placeholder="Select a group type" /></SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Button size="sm" onClick={save} disabled={saving || !groupTypeId}>
          <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">
        Assign coaches to specific groups from the <Link to="/cg-coaching" className="underline">CG Coaching page</Link>.
      </div>
    </div>
  );
}
