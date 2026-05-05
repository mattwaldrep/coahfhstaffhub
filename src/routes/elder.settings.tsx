import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { getPcoConfig, savePcoConfig, pingPco, listPcoFieldDefinitions } from "@/server/pastoral-care.functions";

export const Route = createFileRoute("/elder/settings")({
  component: ElderSettings,
});

function ElderSettings() {
  const { isFullElder } = useAuth();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-display font-semibold">Elder settings</h2>
        <p className="text-sm text-muted-foreground">
          Configure Planning Center, briefing and recap emails for elder meetings.
        </p>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-5 space-y-3">
        <div className="text-sm font-medium">Automated communications</div>
        <p className="text-xs text-muted-foreground">
          Briefing emails go out the day before each meeting; recaps go out the morning after.
          Two versions are sent: one for full elders (includes Executive Session content) and one for elder candidates (standard content only).
        </p>
        <p className="text-xs text-muted-foreground">
          The cron hooks <code>/api/public/hooks/elder-briefing</code> and <code>/api/public/hooks/elder-recap</code> trigger sends; configure them in your scheduler with the shared <code>CRON_SHARED_SECRET</code>.
        </p>
      </div>

      {isFullElder ? <PcoCard /> : (
        <div className="text-xs text-muted-foreground">
          Planning Center configuration is reserved for full elders.
        </div>
      )}
    </div>
  );
}

function PcoCard() {
  const [cfg, setCfg] = useState<any>(null);
  const [listId, setListId] = useState("");
  const [elderField, setElderField] = useState("");
  const [healthField, setHealthField] = useState("");
  const [fields, setFields] = useState<Array<{ id: string; name: string; tab: string | null; data_type: string | null }> | null>(null);
  const [loadingFields, setLoadingFields] = useState(false);
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; me?: string; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [pinging, setPinging] = useState(false);

  async function loadFields() {
    setLoadingFields(true);
    setFieldsError(null);
    try {
      const f: any = await listPcoFieldDefinitions();
      setFields(f);
    } catch (e: any) {
      setFieldsError(e.message ?? "Failed to load fields");
    } finally {
      setLoadingFields(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const c: any = await getPcoConfig();
        setCfg(c);
        setListId(c?.list_id ?? "");
        setElderField(c?.assigned_elder_field_id ?? "");
        setHealthField(c?.spiritual_health_field_id ?? "");
      } catch { /* noop */ }
    })();
    loadFields();
  }, []);

  async function ping() {
    setPinging(true);
    try { setStatus(await pingPco() as any); }
    catch (e: any) { setStatus({ ok: false, error: e.message }); }
    finally { setPinging(false); }
  }

  async function save() {
    setSaving(true);
    try {
      await savePcoConfig({
        data: {
          list_id: listId.trim(),
          assigned_elder_field_id: elderField.trim(),
          spiritual_health_field_id: healthField.trim(),
        },
      });
      toast.success("Saved");
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
      <div>
        <div className="text-sm font-medium">Planning Center</div>
        <p className="text-xs text-muted-foreground mt-1">
          Pulls the care list and custom fields from PCO People. The Personal Access Token is configured as a server secret.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={ping} disabled={pinging}>
          {pinging ? "Checking…" : "Test connection"}
        </Button>
        {status && (
          <span className={`text-xs ${status.ok ? "text-[oklch(0.6_0.15_150)]" : "text-destructive"}`}>
            {status.ok ? `Connected as ${status.me}` : `Failed: ${status.error}`}
          </span>
        )}
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Care list ID</Label>
          <Input value={listId} onChange={(e) => setListId(e.target.value)} placeholder="e.g. 123456" className="h-8 text-sm" />
          <p className="text-[11px] text-muted-foreground">
            Open the list in PCO People — the URL ends in <code>/lists/&lt;id&gt;</code>.
          </p>
        </div>
        <FieldPicker
          label="Assigned Elder field"
          value={elderField}
          onChange={setElderField}
          fields={fields}
          loading={loadingFields}
          error={fieldsError}
          onReload={loadFields}
        />
        <FieldPicker
          label="Spiritual Health field"
          value={healthField}
          onChange={setHealthField}
          fields={fields}
          loading={loadingFields}
          error={fieldsError}
          onReload={loadFields}
        />
        <p className="text-[11px] text-muted-foreground">
          Fields are loaded directly from your Planning Center account. If a field is missing, create it in PCO under Settings → People → Tabs &amp; Fields, then click Reload.
        </p>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={saving || !listId || !elderField || !healthField}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      {cfg?.updated_at && (
        <div className="text-[11px] text-muted-foreground">
          Last updated {new Date(cfg.updated_at).toLocaleString()}
        </div>
      )}
    </div>
  );
}
