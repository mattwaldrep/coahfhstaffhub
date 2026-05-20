import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { parseFinancePdf, matchCategory, type ParsedFinanceReport, type ParsedFinanceRow, type CategoryRef } from "@/lib/parse-finance-pdf";
import { applyFinanceImport } from "@/server/finance-import.functions";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

type RowState = {
  row: ParsedFinanceRow;
  categoryId: string | null;
  createAs: string | null; // name to create if no category selected
  include: boolean;
  confidence: "exact" | "substring" | "fuzzy" | "unmatched";
};

export function ImportReviewDialog({
  open,
  onOpenChange,
  reportId,
  filePath,
  fileName,
  defaultFiscalYear,
  onImported,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  reportId: string;
  filePath: string;
  fileName: string;
  defaultFiscalYear: number;
  onImported: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedFinanceReport | null>(null);
  const [categories, setCategories] = useState<CategoryRef[]>([]);
  const [fiscalYear, setFiscalYear] = useState<number>(defaultFiscalYear);
  const [rowStates, setRowStates] = useState<RowState[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const apply = useServerFn(applyFinanceImport);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setParsed(null);
    (async () => {
      try {
        const { data: signed, error: sErr } = await supabase.storage
          .from("finance-reports")
          .createSignedUrl(filePath, 120);
        if (sErr) throw sErr;
        const res = await fetch(signed.signedUrl);
        if (!res.ok) throw new Error(`Couldn't download report (${res.status})`);
        const blob = await res.blob();
        const result = await parseFinancePdf(blob);
        if (result.rows.length === 0) {
          throw new Error("No recognizable budget rows found in this PDF. The 'Statement of Activity by Month' table couldn't be located.");
        }
        const fy = result.fiscalYear ?? defaultFiscalYear;
        setFiscalYear(fy);
        const { data: cats } = await supabase
          .from("budget_categories")
          .select("id, name")
          .eq("fiscal_year", fy)
          .order("name");
        const catList = (cats ?? []) as CategoryRef[];
        setCategories(catList);
        const states: RowState[] = result.rows.map((row) => {
          const match = matchCategory(row, catList);
          return {
            row,
            categoryId: match?.categoryId ?? null,
            createAs: match ? null : row.displayName,
            include: true,
            confidence: match?.confidence ?? "unmatched",
          };
        });
        setRowStates(states);
        setParsed(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to parse");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, filePath, defaultFiscalYear]);

  // When fiscalYear changes, reload categories and re-match
  useEffect(() => {
    if (!parsed) return;
    (async () => {
      const { data: cats } = await supabase
        .from("budget_categories")
        .select("id, name")
        .eq("fiscal_year", fiscalYear)
        .order("name");
      const catList = (cats ?? []) as CategoryRef[];
      setCategories(catList);
      setRowStates((prev) => prev.map((rs) => {
        const match = matchCategory(rs.row, catList);
        return {
          ...rs,
          categoryId: match?.categoryId ?? null,
          createAs: match ? null : rs.row.displayName,
          confidence: match?.confidence ?? "unmatched",
        };
      }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiscalYear]);

  const matched = useMemo(() => rowStates.filter((r) => r.confidence !== "unmatched"), [rowStates]);
  const unmatched = useMemo(() => rowStates.filter((r) => r.confidence === "unmatched"), [rowStates]);

  const includedCellCount = useMemo(() => {
    return rowStates
      .filter((r) => r.include && (r.categoryId || r.createAs))
      .reduce((sum, r) => sum + Object.keys(r.row.monthly).length, 0);
  }, [rowStates]);

  async function onImport() {
    setSubmitting(true);
    try {
      const payloadRows = rowStates
        .filter((r) => r.include && (r.categoryId || r.createAs))
        .map((r) => ({
          categoryId: r.categoryId,
          createAs: r.categoryId ? null : r.createAs,
          monthly: Object.fromEntries(
            Object.entries(r.row.monthly).map(([m, v]) => [String(m), v]),
          ),
        }));
      if (payloadRows.length === 0) {
        toast.error("Nothing selected to import");
        setSubmitting(false);
        return;
      }
      const result = await apply({
        data: { reportId, fiscalYear, rows: payloadRows },
      });
      toast.success(`Imported ${result.cellsWritten} cells${result.createdCategories ? `, created ${result.createdCategories} categories` : ""}`);
      onImported();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setSubmitting(false);
    }
  }

  const yearOptions = Array.from({ length: 5 }, (_, i) => defaultFiscalYear - 2 + i);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import to budget vs. actuals</DialogTitle>
          <DialogDescription className="truncate">{fileName}</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Parsing PDF…
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-medium text-destructive">Couldn't parse this report</div>
              <p className="text-muted-foreground mt-1">{error}</p>
              <p className="text-muted-foreground mt-2 text-xs">
                The file is still saved — you can download and enter values manually in the grid.
              </p>
            </div>
          </div>
        )}

        {parsed && !error && (
          <div className="flex-1 overflow-y-auto space-y-4 -mx-6 px-6">
            <div className="flex items-center gap-3 text-sm bg-background/40 rounded-lg p-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <div className="flex-1">
                <div>
                  Detected <span className="font-medium">{parsed.rows.length}</span> rows across{" "}
                  <span className="font-medium">{parsed.months.length}</span> month{parsed.months.length === 1 ? "" : "s"}
                  {parsed.months.length > 0 && ` (${parsed.months.map((m) => MONTHS[m - 1]).join(", ")})`}
                </div>
                <div className="text-xs text-muted-foreground">
                  {matched.length} matched · {unmatched.length} unmatched · {parsed.ignored.length} ignored (totals/headers)
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">FY</span>
                <Select value={String(fiscalYear)} onValueChange={(v) => setFiscalYear(Number(v))}>
                  <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <RowSection title="Matched" subtitle="Auto-mapped to existing categories" rows={matched} categories={categories} setRowStates={setRowStates} rowStates={rowStates} />
            <RowSection title="Needs your help" subtitle="No category matched — pick one or create new" rows={unmatched} categories={categories} setRowStates={setRowStates} rowStates={rowStates} highlight />
          </div>
        )}

        <DialogFooter className="border-t border-border pt-4 -mx-6 px-6 mt-0">
          <div className="flex-1 text-xs text-muted-foreground">
            {parsed && !error && (
              <>Will write <span className="font-medium text-foreground">{includedCellCount}</span> monthly cells. Existing values in those cells will be overwritten.</>
            )}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={onImport} disabled={!parsed || !!error || submitting || includedCellCount === 0}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RowSection({
  title, subtitle, rows, categories, setRowStates, rowStates, highlight,
}: {
  title: string;
  subtitle: string;
  rows: RowState[];
  categories: CategoryRef[];
  setRowStates: React.Dispatch<React.SetStateAction<RowState[]>>;
  rowStates: RowState[];
  highlight?: boolean;
}) {
  if (rows.length === 0) return null;

  function updateRow(rowName: string, patch: Partial<RowState>) {
    setRowStates(rowStates.map((rs) => rs.row.name === rowName ? { ...rs, ...patch } : rs));
  }

  return (
    <div className={`rounded-xl border ${highlight ? "border-amber-500/40 bg-amber-500/5" : "border-border"} overflow-hidden`}>
      <div className="px-3 py-2 border-b border-border/60 flex items-center justify-between bg-background/40">
        <div>
          <span className="font-medium text-sm">{title}</span>
          <span className="text-xs text-muted-foreground ml-2">{subtitle}</span>
        </div>
        <Badge variant="secondary">{rows.length}</Badge>
      </div>
      <div className="divide-y divide-border/40">
        {rows.map((rs) => {
          const total = rs.row.total ?? Object.values(rs.row.monthly).reduce((a, b) => a + b, 0);
          const months = Object.keys(rs.row.monthly).map(Number).sort((a, b) => a - b);
          return (
            <div key={rs.row.name} className="px-3 py-2.5 flex items-start gap-3 hover:bg-background/30">
              <Checkbox
                checked={rs.include}
                onCheckedChange={(c) => updateRow(rs.row.name, { include: Boolean(c) })}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">{rs.row.displayName}</span>
                  {rs.row.account && <span className="text-[10px] text-muted-foreground font-mono">{rs.row.account}</span>}
                  {rs.confidence !== "unmatched" && rs.confidence !== "exact" && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1">{rs.confidence} match</Badge>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {months.map((m) => `${MONTHS[m - 1]} ${fmt(rs.row.monthly[m])}`).join(" · ")}
                </div>
              </div>
              <div className="text-right shrink-0 w-24">
                <div className="text-xs font-mono tabular-nums">{fmt(total)}</div>
              </div>
              <div className="shrink-0 w-52">
                <Select
                  value={rs.categoryId ?? "__new__"}
                  onValueChange={(v) => {
                    if (v === "__new__") {
                      updateRow(rs.row.name, { categoryId: null, createAs: rs.createAs ?? rs.row.displayName });
                    } else if (v === "__skip__") {
                      updateRow(rs.row.name, { categoryId: null, createAs: null, include: false });
                    } else {
                      updateRow(rs.row.name, { categoryId: v, createAs: null });
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__new__">+ Create "{rs.row.displayName}"</SelectItem>
                    <SelectItem value="__skip__">Skip this row</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
