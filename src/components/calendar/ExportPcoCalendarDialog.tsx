import { useMemo, useState } from "react";
import { format } from "date-fns";
import Papa from "papaparse";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getPcoCalendar, type PcoCalendarInstance, type PcoTagGroup } from "@/lib/pco-calendar.functions";

function esc(s: unknown) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function stripHtml(s: string | null | undefined) {
  return (s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Export any date range of the Planning Center calendar as CSV or a printable PDF. */
export function ExportPcoCalendarDialog({
  open,
  onOpenChange,
  tagGroups,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tagGroups: PcoTagGroup[];
}) {
  const fetchCal = useServerFn(getPcoCalendar);
  const today = new Date();
  const [from, setFrom] = useState(format(today, "yyyy-MM-01"));
  const [to, setTo] = useState(
    format(new Date(today.getFullYear(), today.getMonth() + 1, 0), "yyyy-MM-dd"),
  );
  const [tags, setTags] = useState<Record<string, boolean>>({});
  const [includeDetails, setIncludeDetails] = useState(true);
  const [busy, setBusy] = useState(false);

  const allTags = useMemo(
    () => tagGroups.flatMap((g) => g.tags.map((t) => ({ ...t, group: g.name }))),
    [tagGroups],
  );

  const excludedTagIds = useMemo(
    () => new Set(allTags.filter((t) => tags[t.id] === false).map((t) => t.id)),
    [allTags, tags],
  );

  async function collect(): Promise<PcoCalendarInstance[]> {
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T23:59:59`);
    if (!(start <= end)) throw new Error("End date must be after the start date");
    const res = await fetchCal({ data: { from: start.toISOString(), to: end.toISOString() } });
    if (res.error) throw new Error(res.error);
    return res.instances
      .filter((e) => !(excludedTagIds.size > 0 && e.tag_ids.some((t) => excludedTagIds.has(t))))
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  }

  function tagNamesFor(e: PcoCalendarInstance) {
    return e.tag_ids
      .map((id) => allTags.find((t) => t.id === id)?.name)
      .filter(Boolean)
      .join(", ");
  }

  function timeFor(e: PcoCalendarInstance) {
    if (e.all_day) return "All day";
    const start = format(new Date(e.starts_at), "h:mm a");
    return e.ends_at ? `${start} – ${format(new Date(e.ends_at), "h:mm a")}` : start;
  }

  async function exportCsv() {
    setBusy(true);
    try {
      const rows = await collect();
      if (!rows.length) {
        toast.error("No events in that range");
        return;
      }
      const csv = Papa.unparse(
        rows.map((e) => ({
          Date: format(new Date(e.starts_at), "yyyy-MM-dd"),
          Day: format(new Date(e.starts_at), "EEEE"),
          Time: timeFor(e),
          Title: e.name,
          Tags: tagNamesFor(e),
          Location: e.location ?? "",
          ...(includeDetails ? { Details: stripHtml(e.description ?? e.summary) } : {}),
        })),
        { escapeFormulae: true },
      );
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `calendar_${from}_to_${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} events`);
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    } finally {
      setBusy(false);
    }
  }

  async function exportPdf() {
    setBusy(true);
    try {
      const rows = await collect();
      if (!rows.length) {
        toast.error("No events in that range");
        return;
      }
      const groups = new Map<string, PcoCalendarInstance[]>();
      for (const e of rows) {
        const k = format(new Date(e.starts_at), "yyyy-MM-dd");
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(e);
      }
      const body = [...groups.entries()]
        .map(
          ([day, items]) => `
        <section>
          <h2>${esc(format(new Date(`${day}T00:00:00`), "EEEE, MMMM d, yyyy"))}</h2>
          <table>
            <tbody>
              ${items
                .map(
                  (e) => `<tr>
                <td class="time">${esc(timeFor(e))}</td>
                <td>
                  <div class="title">${esc(e.name)}</div>
                  <div class="meta">${[tagNamesFor(e), e.location].filter(Boolean).map(esc).join(" · ")}</div>
                  ${
                    includeDetails && (e.description || e.summary)
                      ? `<div class="desc">${esc(stripHtml(e.description ?? e.summary))}</div>`
                      : ""
                  }
                </td>
              </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </section>`,
        )
        .join("");

      const html = `<!doctype html><html><head><meta charset="utf-8">
        <title>Calendar ${esc(from)} – ${esc(to)}</title>
        <style>
          @page { margin: 18mm; }
          body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color:#24272A; }
          h1 { font-size: 20px; margin:0 0 2px; }
          .sub { color:#758592; font-size:12px; margin-bottom:18px; }
          section { break-inside: avoid; margin-bottom:14px; }
          h2 { font-size:13px; margin:0 0 4px; padding-bottom:3px; border-bottom:1px solid #C8602D; color:#C8602D; }
          table { width:100%; border-collapse:collapse; }
          td { vertical-align:top; padding:4px 0; border-bottom:1px solid #eee; font-size:12px; }
          td.time { width:86px; color:#758592; white-space:nowrap; }
          .title { font-weight:600; }
          .meta { color:#758592; font-size:11px; }
          .desc { font-size:11px; margin-top:2px; }
        </style></head><body>
        <h1>City on a Hill Forest Hills — Calendar</h1>
        <div class="sub">${esc(format(new Date(`${from}T00:00:00`), "MMM d, yyyy"))} – ${esc(
          format(new Date(`${to}T00:00:00`), "MMM d, yyyy"),
        )} · ${rows.length} events</div>
        ${body}
        <script>window.onload = () => { window.print(); }<\/script>
        </body></html>`;

      const w = window.open("", "_blank");
      if (!w) {
        toast.error("Allow pop-ups to export a PDF");
        return;
      }
      w.document.write(html);
      w.document.close();
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Export calendar</DialogTitle>
          <DialogDescription>
            Pick a date range and filters, then download a CSV or print/save a PDF. Events come straight from Planning Center.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-from">From</Label>
              <Input id="exp-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-to">To</Label>
              <Input id="exp-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          {allTags.length > 0 && (
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-3">
                {allTags.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={tags[t.id] !== false}
                      onCheckedChange={(v) => setTags((p) => ({ ...p, [t.id]: v === true }))}
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={includeDetails}
              onCheckedChange={(v) => setIncludeDetails(v === true)}
            />
            Include event descriptions
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={exportCsv} disabled={busy} className="rounded-xl">
              Export CSV
            </Button>
            <Button onClick={exportPdf} disabled={busy} className="rounded-xl font-bold">
              Export PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
