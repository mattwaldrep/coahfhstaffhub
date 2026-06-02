import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { listArchive, getArchiveEntry, importArchiveBatch } from "@/lib/pastoral-care.functions";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Upload } from "lucide-react";

export const Route = createFileRoute("/elder/archive")({
  component: Archive,
});

function Archive() {
  const { isFullElder } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [json, setJson] = useState("");
  const [importing, setImporting] = useState(false);

  async function load() {
    setLoading(true);
    try { setRows(await listArchive() as any[]); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function openEntry(id: string) {
    try { setSelected(await getArchiveEntry({ data: { id } })); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
  }

  async function doImport() {
    setImporting(true);
    try {
      const parsed = JSON.parse(json);
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      const result = await importArchiveBatch({ data: { entries } });
      toast.success(`Imported ${(result as any).count} entries`);
      setImportOpen(false); setJson("");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Invalid JSON");
    } finally { setImporting(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-display font-semibold">Historical archive</h2>
        {isFullElder && (
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4 mr-1.5" /> Import JSON
          </Button>
        )}
      </div>
      <div className="bg-surface border border-border rounded-2xl divide-y divide-border">
        {loading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
        {!loading && rows.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">
            No archived meetings yet. Paste an exported JSON batch from the historical Google Doc using "Import JSON" above.
          </div>
        )}
        {rows.map((r) => (
          <button
            key={r.id}
            onClick={() => openEntry(r.id)}
            className="w-full text-left flex items-center justify-between px-4 py-3 hover:bg-background/40"
          >
            <div>
              <div className="text-sm font-medium">{r.title ?? "Elder Meeting"}</div>
              <div className="text-xs text-muted-foreground">
                {format(new Date(r.meeting_date), "MMM d, yyyy")} · {r.meeting_type}
              </div>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Read-only</span>
          </button>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.title ?? "Elder Meeting"}</DialogTitle>
              </DialogHeader>
              <div className="text-xs text-muted-foreground mb-3">
                {format(new Date(selected.meeting_date), "EEEE, MMM d, yyyy")} · {selected.meeting_type}
              </div>
              {selected.raw_text && (
                <pre className="text-xs whitespace-pre-wrap font-sans bg-background rounded p-3 border border-border">
                  {selected.raw_text}
                </pre>
              )}
              {!selected.raw_text && (
                <div className="text-sm text-muted-foreground">No body recorded.</div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Import archived meetings</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            Paste an array of JSON objects with at least <code>meeting_date</code> (YYYY-MM-DD).
            Optional fields: <code>title</code>, <code>meeting_type</code>, <code>raw_text</code>, <code>attendees</code>, <code>agenda</code>, <code>action_items</code>, <code>source_url</code>.
          </p>
          <Textarea rows={10} value={json} onChange={(e) => setJson(e.target.value)} placeholder='[{ "meeting_date": "2024-03-12", "title": "Elder Meeting", "raw_text": "..." }]' />
          <DialogFooter>
            <Button onClick={doImport} disabled={importing || !json.trim()}>{importing ? "Importing…" : "Import"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
