import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { applyFinanceSnapshot } from "@/server/finance-snapshot.functions";
import { parseQboCsv, matchCategory, type QboLine } from "@/lib/parse-qbo-csv";
import { fiscalMonthIndex } from "@/lib/fiscal-year";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

type Category = { id: string; name: string; fiscal_year: number; annual_budget: number };

function getErrorMessage(error: unknown) {
  if (error instanceof Response) return error.status === 401 ? "Your session expired. Please sign in again and retry the import." : `Import failed (${error.status})`;
  if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return "Import failed";
}

type RowState = {
  line: QboLine;
  // null = create new category with this name; uuid = map to existing
  categoryId: string | null;
  createAs: string | null;
  ignored: boolean;
};

export function SnapshotReviewDialog({
  open,
  onOpenChange,
  reportId,
  filePath,
  fileName,
  defaultFiscalYear,
  defaultMonth,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  reportId: string | null;
  filePath: string | null;
  fileName: string;
  defaultFiscalYear: number;
  defaultMonth: number;
  onApplied: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fiscalYear, setFiscalYear] = useState(defaultFiscalYear);
  const [asOfMonth, setAsOfMonth] = useState(defaultMonth);
  const [fullYear, setFullYear] = useState(false);
  const [rows, setRows] = useState<RowState[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const applyFn = useServerFn(applyFinanceSnapshot);

  useEffect(() => {
    if (!open || !filePath) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const { data: blob, error: dlErr } = await supabase.storage
          .from("finance-reports").download(filePath);
        if (dlErr) throw dlErr;
        const text = await blob.text();
        const parsed = parseQboCsv(text);

        const { data: catData } = await supabase
          .from("budget_categories").select("id,name,fiscal_year,annual_budget")
          .eq("fiscal_year", parsed.fiscalYear ?? defaultFiscalYear);
        const catList = (catData ?? []) as Category[];
        if (cancelled) return;

        setCats(catList);
        setFiscalYear(parsed.fiscalYear ?? defaultFiscalYear);
        setAsOfMonth(parsed.asOfMonth ?? defaultMonth);
        setFullYear(parsed.fullYear);
        setIgnored(parsed.ignored);

        const matchable = catList.map((c) => ({ id: c.id, name: c.name }));
        setRows(parsed.lines.map((line) => {
          const match = matchCategory(line.name, matchable);
          return {
            line,
            categoryId: match?.id ?? null,
            createAs: match ? null : line.name,
            ignored: false,
          };
        }));
      } catch (e: any) {
        setError(e.message ?? "Failed to parse file");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, filePath, defaultFiscalYear, defaultMonth]);

  const stats = useMemo(() => {
    const matched = rows.filter((r) => !r.ignored && r.categoryId).length;
    const create = rows.filter((r) => !r.ignored && !r.categoryId && r.createAs).length;
    const skipped = rows.filter((r) => r.ignored).length;
    return { matched, create, skipped };
  }, [rows]);

  async function handleApply() {
    setSubmitting(true);
    try {
      // For partial-year reports, QBO's "YTD Budget" is the annual budget
      // prorated to months elapsed. Extrapolate back to a full-year figure
      // so newly created categories don't land with annual_budget = 0.
      const monthsElapsed = fullYear ? 12 : fiscalMonthIndex(asOfMonth);
      const scale = monthsElapsed > 0 ? 12 / monthsElapsed : 1;
      const lines = rows
        .filter((r) => !r.ignored)
        .map((r) => ({
          categoryId: r.categoryId,
          createAs: r.categoryId ? null : (r.createAs ?? r.line.name),
          ytdActual: r.line.ytdActual,
          ytdBudget: r.line.ytdBudget,
          annualBudget: fullYear
            ? r.line.ytdBudget
            : Math.round(r.line.ytdBudget * scale),
        }));
      if (!lines.length) {
        toast.error("Nothing to import");
        setSubmitting(false);
        return;
      }
      const result = await applyFn({
        data: {
          fiscalYear,
          asOfMonth,
          sourceReportId: reportId,
          updateAnnualBudgets: fullYear,
          lines,
        },
      });
      toast.success(
        `Imported ${result.linesWritten} lines${result.createdCategories ? `, created ${result.createdCategories} categories` : ""}`,
      );
      onApplied();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Import {fileName}</DialogTitle>
          <DialogDescription>
            Review detected categories and YTD values before writing to the dashboard.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Parsing report…
          </div>
        ) : error ? (
          <div className="text-sm text-destructive py-6">{error}</div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Fiscal year</Label>
                <Input type="number" value={fiscalYear}
                  onChange={(e) => setFiscalYear(Number(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">As-of month</Label>
                <Select value={String(asOfMonth)} onValueChange={(v) => setAsOfMonth(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={fullYear} onCheckedChange={(v) => setFullYear(!!v)} />
                  Full-year report — use Budget column as annual budget
                </label>
              </div>
            </div>

            <div className="flex gap-2 text-xs mt-2">
              <Badge variant="secondary">{stats.matched} matched</Badge>
              <Badge variant="outline">{stats.create} new categories</Badge>
              <Badge variant="outline">{stats.skipped} skipped</Badge>
              <Badge variant="outline">{ignored.length} subtotals ignored</Badge>
            </div>

            <div className="overflow-y-auto flex-1 -mx-6 px-6 mt-2 border-t border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="text-left py-2 w-[40%]">Line</th>
                    <th className="text-right py-2">YTD actual</th>
                    <th className="text-right py-2">YTD budget</th>
                    <th className="text-left py-2 pl-3">Maps to</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={idx} className={`border-b border-border/40 ${r.ignored ? "opacity-40" : ""}`}>
                      <td className="py-1.5" style={{ paddingLeft: Math.min(r.line.indent * 4, 32) }}>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={!r.ignored}
                            onCheckedChange={(v) => {
                              const next = [...rows]; next[idx] = { ...r, ignored: !v }; setRows(next);
                            }}
                          />
                          <span className="truncate">{r.line.name}</span>
                        </div>
                      </td>
                      <td className="text-right tabular-nums">{fmt(r.line.ytdActual)}</td>
                      <td className="text-right tabular-nums text-muted-foreground">{fmt(r.line.ytdBudget)}</td>
                      <td className="pl-3 py-1.5">
                        <Select
                          value={r.categoryId ?? "__new__"}
                          onValueChange={(v) => {
                            const next = [...rows];
                            next[idx] = v === "__new__"
                              ? { ...r, categoryId: null, createAs: r.createAs ?? r.line.name }
                              : { ...r, categoryId: v, createAs: null };
                            setRows(next);
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__new__">+ Create "{r.createAs ?? r.line.name}"</SelectItem>
                            {cats.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleApply} disabled={submitting || loading || !!error}>
            {submitting ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Importing…</> : "Import to dashboard"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
