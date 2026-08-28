import { useMemo, useState } from "react";
import { format } from "date-fns";
import Papa from "papaparse";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SubCalOption = { value: string; label: string; color: string };

export type ExportOccurrence = {
  id: string;
  title: string;
  description: string | null;
  sub_calendar: string;
  category: string | null;
  leader_name: string | null;
  location: string | null;
  room_needed: string | null;
  all_day: boolean;
  end_at: string | null;
  occurrence_date: Date;
  span_day_index?: number;
  span_total_days?: number;
};

function esc(s: unknown) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function ExportCalendarDialog({
  open,
  onOpenChange,
  subCals,
  categories,
  expand,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subCals: SubCalOption[];
  categories: { id: string; name: string }[];
  /** Expand raw event rows into occurrences within a range. */
  expand: (events: any[], start: Date, end: Date) => ExportOccurrence[];
}) {
  const today = new Date();
  const [from, setFrom] = useState(format(today, "yyyy-MM-01"));
  const [to, setTo] = useState(
    format(new Date(today.getFullYear(), today.getMonth() + 1, 0), "yyyy-MM-dd"),
  );
  const [cals, setCals] = useState<Record<string, boolean>>({});
  const [category, setCategory] = useState("all");
  const [includeDetails, setIncludeDetails] = useState(true);
  const [busy, setBusy] = useState(false);

  const selectedCals = useMemo(() => {
    const on = subCals.filter((s) => cals[s.value] !== false).map((s) => s.value);
    return on.length ? on : subCals.map((s) => s.value);
  }, [cals, subCals]);

  async function collect(): Promise<ExportOccurrence[]> {
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T23:59:59`);
    if (!(start <= end)) throw new Error("End date must be after the start date");

    const { data, error } = await supabase
      .from("calendar_events")
      .select("*")
      .or(`and(start_at.lte.${end.toISOString()},end_at.gte.${start.toISOString()}),and(start_at.gte.${start.toISOString()},start_at.lte.${end.toISOString()}),rrule.not.is.null`)
      .order("start_at", { ascending: true });
    if (error) throw new Error(error.message);

    return expand((data ?? []) as any[], start, end)
      .filter((o) => selectedCals.includes(o.sub_calendar))
      .filter((o) => category === "all" || o.category === category)
      .sort((a, b) => a.occurrence_date.getTime() - b.occurrence_date.getTime());
  }

  function labelFor(v: string) {
    return subCals.find((s) => s.value === v)?.label ?? v;
  }

  function timeFor(o: ExportOccurrence) {
    if (o.all_day) return "All day";
    return format(o.occurrence_date, "h:mm a");
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
        rows.map((o) => ({
          Date: format(o.occurrence_date, "yyyy-MM-dd"),
          Day: format(o.occurrence_date, "EEEE"),
          Time: timeFor(o),
          Title: o.title,
          "Sub-calendar": labelFor(o.sub_calendar),
          Category: o.category ?? "",
          Leader: o.leader_name ?? "",
          Location: o.location ?? "",
          Room: o.room_needed ?? "",
          ...(includeDetails ? { Details: (o.description ?? "").replace(/<[^>]+>/g, " ").trim() } : {}),
        })),
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
      const groups = new Map<string, ExportOccurrence[]>();
      for (const o of rows) {
        const k = format(o.occurrence_date, "yyyy-MM-dd");
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(o);
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
                  (o) => `<tr>
                <td class="time">${esc(timeFor(o))}</td>
                <td>
                  <div class="title">${esc(o.title)}${
                    o.span_total_days && o.span_total_days > 1
                      ? ` <span class="meta">(Day ${o.span_day_index} of ${o.span_total_days})</span>`
                      : ""
                  }</div>
                  <div class="meta">${[
                    labelFor(o.sub_calendar),
                    o.category,
                    o.leader_name ? `Led by ${o.leader_name}` : "",
                    o.location,
                    o.room_needed,
                  ]
                    .filter(Boolean)
                    .map(esc)
                    .join(" · ")}</div>
                  ${
                    includeDetails && o.description
                      ? `<div class="desc">${esc(
                          o.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
                        )}</div>`
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
            Pick a date range and filters, then download a CSV or print/save a PDF.
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

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Sub-calendars</Label>
            <div className="flex flex-wrap gap-3">
              {subCals.map((s) => (
                <label key={s.value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={cals[s.value] !== false}
                    onCheckedChange={(v) => setCals((p) => ({ ...p, [s.value]: v === true }))}
                  />
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </label>
              ))}
            </div>
          </div>

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
