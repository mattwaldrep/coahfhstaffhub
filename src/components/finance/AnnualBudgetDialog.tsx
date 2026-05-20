import { useState } from "react";
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
import { applyAnnualBudget } from "@/server/finance-budget.functions";
import { parseQboBudget, type AnnualBudgetLine } from "@/lib/parse-qbo-budget";
import { matchCategory } from "@/lib/parse-qbo-csv";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

type Category = { id: string; name: string; fiscal_year: number; annual_budget: number };

function getErrorMessage(error: unknown) {
  if (error instanceof Response) return error.status === 401 ? "Your session expired. Please sign in again and retry." : `Import failed (${error.status})`;
  if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return "Import failed";
}

type RowState = {
  line: AnnualBudgetLine;
  categoryId: string | null;
  createAs: string | null;
  ignored: boolean;
};

export function AnnualBudgetDialog({
  open,
  onOpenChange,
  fiscalYear,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fiscalYear: number;
  onApplied: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [detectedFy, setDetectedFy] = useState<number>(fiscalYear);
  const applyFn = useServerFn(applyAnnualBudget);

  function reset() {
    setFile(null); setRows([]); setIgnored([]); setError(null); setDetectedFy(fiscalYear);
  }

  async function handleFile(f: File) {
    setFile(f);
    setLoading(true); setError(null);
    try {
      const parsed = await parseQboBudget(f);
      const fy = parsed.fiscalYear ?? fiscalYear;
      setDetectedFy(fy);

      const { data: catData } = await supabase
        .from("budget_categories").select("id,name,fiscal_year,annual_budget")
        .eq("fiscal_year", fy);
      const catList = (catData ?? []) as Category[];
      setCats(catList);
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
      setError(e?.message ?? "Failed to parse file");
    } finally {
      setLoading(false);
    }
  }

  const incomeRows = rows.filter((r) => r.line.kind === "income");
  const expenseRows = rows.filter((r) => r.line.kind === "expense");

  const stats = {
    matched: rows.filter((r) => !r.ignored && r.categoryId).length,
    create: rows.filter((r) => !r.ignored && !r.categoryId && r.createAs).length,
    skipped: rows.filter((r) => r.ignored).length,
    incomeTotal: incomeRows.filter((r) => !r.ignored).reduce((s, r) => s + r.line.annualBudget, 0),
    expenseTotal: expenseRows.filter((r) => !r.ignored).reduce((s, r) => s + r.line.annualBudget, 0),
  };

  async function handleApply() {
    setSubmitting(true);
    try {
      const lines = rows
        .filter((r) => !r.ignored)
        .map((r) => ({
          categoryId: r.categoryId,
          createAs: r.categoryId ? null : (r.createAs ?? r.line.name),
          annualBudget: r.line.annualBudget,
          kind: r.line.kind,
        }));
      if (!lines.length) {
        toast.error("Nothing to import");
        setSubmitting(false);
        return;
      }
      const result = await applyFn({
        data: { fiscalYear: detectedFy, lines },
      });
      toast.success(
        `Annual budget saved — updated ${result.updated}${result.created ? `, created ${result.created} categories` : ""}`,
      );
      reset();
      onApplied();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  function renderSection(title: string, sectionRows: RowState[], subtotal: number) {
    if (!sectionRows.length) return null;
    return (
      <div className="mt-4">
        <div className="flex items-baseline justify-between mb-1">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
          <span className="text-xs tabular-nums">Subtotal {fmt(subtotal)}</span>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {sectionRows.map((r) => {
              const idx = rows.indexOf(r);
              return (
                <tr key={idx} className={`border-b border-border/40 ${r.ignored ? "opacity-40" : ""}`}>
                  <td className="py-1.5 w-[50%]" style={{ paddingLeft: Math.min(r.line.indent * 4, 32) }}>
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
                  <td className="text-right tabular-nums">{fmt(r.line.annualBudget)}</td>
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
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Import annual budget</DialogTitle>
          <DialogDescription>
            Upload QBO's <strong>Budget Overview</strong> for the fiscal year (CSV or Excel). This sets the annual budget for each category.
          </DialogDescription>
        </DialogHeader>

        {!file ? (
          <div className="space-y-3 py-4">
            <Label>Budget Overview file</Label>
            <Input
              type="file"
              accept=".csv,.xlsx,.xls,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <p className="text-xs text-muted-foreground">
              In QBO: Reports → Budget Overview → choose the fiscal year → Export as Excel or CSV.
            </p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Parsing {file.name}…
          </div>
        ) : error ? (
          <div className="space-y-2 py-4">
            <div className="text-sm text-destructive">{error}</div>
            <Button variant="outline" size="sm" onClick={reset}>Try a different file</Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Fiscal year</Label>
                <Input type="number" value={detectedFy}
                  onChange={(e) => setDetectedFy(Number(e.target.value))} />
              </div>
              <div className="col-span-2 flex items-end text-xs text-muted-foreground">
                File: <span className="ml-1 font-mono">{file.name}</span>
              </div>
            </div>

            <div className="flex gap-2 text-xs mt-2 flex-wrap">
              <Badge variant="secondary">{stats.matched} matched</Badge>
              <Badge variant="outline">{stats.create} new categories</Badge>
              <Badge variant="outline">{stats.skipped} skipped</Badge>
              <Badge variant="outline">{ignored.length} subtotals ignored</Badge>
              <Badge className="bg-emerald-600 hover:bg-emerald-600">Income {fmt(stats.incomeTotal)}</Badge>
              <Badge className="bg-rose-600 hover:bg-rose-600">Expense {fmt(stats.expenseTotal)}</Badge>
              <Badge variant="outline">
                Net {fmt(stats.incomeTotal - stats.expenseTotal)}
              </Badge>
            </div>

            <div className="overflow-y-auto flex-1 -mx-6 px-6 mt-2 border-t border-border">
              {renderSection("Income", incomeRows, stats.incomeTotal)}
              {renderSection("Expense", expenseRows, stats.expenseTotal)}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          {file && !loading && !error && (
            <Button onClick={handleApply} disabled={submitting}>
              {submitting ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving…</> : "Save annual budget"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
