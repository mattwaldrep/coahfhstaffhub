import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Upload, Trash2, FileText, Download, ShieldAlert, Sparkles, Info } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { SnapshotReviewDialog } from "@/components/finance/SnapshotReviewDialog";
import { AnnualBudgetDialog } from "@/components/finance/AnnualBudgetDialog";
import { currentFiscalYear, fiscalMonthIndex, fiscalYearRangeLabel } from "@/lib/fiscal-year";

export const Route = createFileRoute("/finance")({
  component: FinancePage,
});

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
// Calendar year of a (fiscal_year, month) cell. Jul–Dec belong to fy-1; Jan–Jun belong to fy.
const calYearOf = (fy: number, month: number) => (month >= 7 ? fy - 1 : fy);
const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);
const pct = (n: number) => `${Math.round(n * 100)}%`;

type Classification = "operating_income" | "bridge_income" | "operating_expense" | "designated_expense";
type Category = { id: string; name: string; fiscal_year: number; annual_budget: number; sort_order: number; kind: "income" | "expense"; classification: Classification };
type Snapshot = { id: string; fiscal_year: number; as_of_month: number; source_report_id: string | null; created_at: string };
type SnapshotLine = { id: string; snapshot_id: string; category_id: string; ytd_actual: number; ytd_budget: number; annual_budget: number | null };
type Report = { id: string; fiscal_year: number; month: number; label: string | null; file_path: string; file_name: string; mime_type: string | null; created_at: string; imported_at: string | null };

function FinancePage() { return <AppShell><Body /></AppShell>; }

function Body() {
  const { hasRole, loading } = useAuth();
  const isCore = hasRole("core");
  const [year, setYear] = useState<number>(currentFiscalYear());

  if (loading) return null;
  if (!isCore) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-3">
        <ShieldAlert className="w-10 h-10 mx-auto text-muted-foreground" />
        <h1 className="text-xl font-display font-semibold">Core access only</h1>
        <p className="text-sm text-muted-foreground">Finance is restricted to core admins.</p>
        <Button asChild variant="outline" size="sm"><Link to="/">Back home</Link></Button>
      </div>
    );
  }

  const currentFy = currentFiscalYear();
  const years = Array.from({ length: 5 }, (_, i) => currentFy - 2 + i);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Finance</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Upload monthly QBO Budget vs. Actuals exports to track YTD performance. Fiscal year runs July&nbsp;1&nbsp;–&nbsp;June&nbsp;30.
          </p>
        </div>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>FY {y} ({fiscalYearRangeLabel(y)})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList>
          <TabsTrigger value="dashboard">Budget vs. actuals</TabsTrigger>
          <TabsTrigger value="reports">Monthly reports</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard" className="mt-4"><DashboardTab year={year} /></TabsContent>
        <TabsContent value="reports" className="mt-4"><ReportsTab year={year} /></TabsContent>
      </Tabs>
    </>
  );
}

/* ---------------- DASHBOARD (snapshot-driven) ---------------- */

function DashboardTab({ year }: { year: number }) {
  const [cats, setCats] = useState<Category[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [lines, setLines] = useState<SnapshotLine[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);

  useEffect(() => { load(); }, [year]);

  async function load() {
    const [{ data: c }, { data: s }] = await Promise.all([
      supabase.from("budget_categories").select("*").eq("fiscal_year", year).order("sort_order").order("name"),
      supabase.from("finance_snapshots").select("*").eq("fiscal_year", year).order("as_of_month", { ascending: true }),
    ]);
    setCats((c ?? []) as Category[]);
    const snaps = (s ?? []) as Snapshot[];
    setSnapshots(snaps);
    const latest = snaps[snaps.length - 1];
    setSelectedSnapshotId(latest?.id ?? null);
    if (snaps.length) {
      const { data: l } = await supabase
        .from("finance_snapshot_lines").select("*")
        .in("snapshot_id", snaps.map((x) => x.id));
      setLines((l ?? []) as SnapshotLine[]);
    } else {
      setLines([]);
    }
  }

  const selectedSnapshot = snapshots.find((s) => s.id === selectedSnapshotId) ?? null;
  const selectedLines = useMemo(
    () => lines.filter((l) => l.snapshot_id === selectedSnapshotId),
    [lines, selectedSnapshotId],
  );
  const lineByCat = useMemo(() => {
    const m = new Map<string, SnapshotLine>();
    selectedLines.forEach((l) => m.set(l.category_id, l));
    return m;
  }, [selectedLines]);

  // Trend across all snapshots: per-category YTD actual by month
  const trendByCat = useMemo(() => {
    const m = new Map<string, number[]>(); // categoryId -> ytd_actual by snapshot order
    cats.forEach((c) => m.set(c.id, snapshots.map(() => 0)));
    snapshots.forEach((snap, i) => {
      lines.filter((l) => l.snapshot_id === snap.id).forEach((l) => {
        const arr = m.get(l.category_id);
        if (arr) arr[i] = Number(l.ytd_actual);
      });
    });
    return m;
  }, [cats, snapshots, lines]);

  const totals = useMemo(() => {
    const byClass = (cls: Classification) => cats.filter((c) => c.classification === cls);
    const opIncomeCats = byClass("operating_income");
    const bridgeCats = byClass("bridge_income");
    const opExpenseCats = byClass("operating_expense");
    const designatedCats = byClass("designated_expense");

    const sumAnnual = (list: Category[]) => list.reduce((s, c) => s + Number(c.annual_budget), 0);
    const sumYtdActual = (list: Category[]) => list.reduce((s, c) => s + Number(lineByCat.get(c.id)?.ytd_actual ?? 0), 0);
    const sumYtdBudget = (list: Category[]) => list.reduce((s, c) => s + Number(lineByCat.get(c.id)?.ytd_budget ?? 0), 0);

    const annual = {
      opIncome: sumAnnual(opIncomeCats),
      bridge: sumAnnual(bridgeCats),
      opExpense: sumAnnual(opExpenseCats),
      designated: sumAnnual(designatedCats),
    };
    const ytdActual = {
      opIncome: sumYtdActual(opIncomeCats),
      bridge: sumYtdActual(bridgeCats),
      opExpense: sumYtdActual(opExpenseCats),
      designated: sumYtdActual(designatedCats),
    };
    const ytdBudget = {
      opIncome: sumYtdBudget(opIncomeCats),
      bridge: sumYtdBudget(bridgeCats),
      opExpense: sumYtdBudget(opExpenseCats),
      designated: sumYtdBudget(designatedCats),
    };

    const asOf = selectedSnapshot?.as_of_month;
    const monthsElapsed = asOf ? fiscalMonthIndex(asOf) : 0;
    const yearPace = monthsElapsed / 12;
    const opSpendPace = annual.opExpense > 0 ? ytdActual.opExpense / annual.opExpense : 0;

    return {
      opIncomeCats, bridgeCats, opExpenseCats, designatedCats,
      annual, ytdActual, ytdBudget,
      monthsElapsed, yearPace, opSpendPace,
      coreLocalMarginAnnual: annual.opIncome - annual.opExpense,
      coreLocalMarginYtd: ytdActual.opIncome - ytdActual.opExpense,
      netOperatingAnnual: annual.opIncome + annual.bridge - annual.opExpense,
      netOperatingYtd: ytdActual.opIncome + ytdActual.bridge - ytdActual.opExpense,
      totalCashAnnual: (annual.opIncome + annual.bridge) - (annual.opExpense + annual.designated),
      totalCashYtd: (ytdActual.opIncome + ytdActual.bridge) - (ytdActual.opExpense + ytdActual.designated),
    };
  }, [cats, lineByCat, selectedSnapshot]);

  if (snapshots.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-10 text-center space-y-3">
        <Info className="w-10 h-10 mx-auto text-muted-foreground" />
        <h2 className="font-display text-lg font-semibold">No reports yet for FY {year}</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          First, upload your <strong>Annual budget</strong> (QBO Budget Overview) under Monthly reports. Then upload your monthly <strong>Budget vs. Actuals — FYTD</strong> CSVs to track YTD performance.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground">
          Showing snapshot <strong className="text-foreground">
            {selectedSnapshot ? `${MONTHS[selectedSnapshot.as_of_month - 1]} ${calYearOf(year, selectedSnapshot.as_of_month)}` : "—"}
          </strong>
          <span className="ml-2 text-xs">FY {year} · {fiscalYearRangeLabel(year)}</span>
        </div>
        <Select value={selectedSnapshotId ?? ""} onValueChange={setSelectedSnapshotId}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Snapshot" /></SelectTrigger>
          <SelectContent>
            {snapshots.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                As of {MONTHS[s.as_of_month - 1]} {calYearOf(s.fiscal_year, s.as_of_month)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Three layered metrics + pacing */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
        <Stat
          label="Core Local Margin"
          value={fmt(totals.coreLocalMarginYtd)}
          sub={`${fmt(totals.coreLocalMarginAnnual)} projected · tithes − op expense`}
          tone="default"
        />
        <Stat
          label="Net Operating Income"
          value={fmt(totals.netOperatingYtd)}
          sub={`${fmt(totals.netOperatingAnnual)} projected · target ≈ $0`}
          tone={Math.abs(totals.netOperatingYtd) > 10000 ? "danger" : "default"}
        />
        <Stat
          label="Total Org Cash Flow"
          value={fmt(totals.totalCashYtd)}
          sub={`${fmt(totals.totalCashAnnual)} projected · all in − all out`}
          tone={totals.totalCashYtd < 0 ? "danger" : "default"}
        />
        <Stat
          label="Op-expense pacing"
          value={`${pct(totals.opSpendPace)} spent`}
          sub={`${pct(totals.yearPace)} of year elapsed`}
          tone={totals.opSpendPace > totals.yearPace + 0.05 ? "danger" : "default"}
        />
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">
        Above the line = operational (tithes &amp; op-expense). Bridge income = restricted-fund release for payroll.
        Below the line = fund-raised church-planting (donor-driven, doesn't distort operational health).
      </p>

      {renderCategoryTable("Operating Income", totals.opIncomeCats, lineByCat, trendByCat, totals.annual.opIncome, totals.ytdActual.opIncome, totals.ytdBudget.opIncome, "income")}
      <div className="mt-4" />
      {renderCategoryTable("Bridge Income (Restricted Release)", totals.bridgeCats, lineByCat, trendByCat, totals.annual.bridge, totals.ytdActual.bridge, totals.ytdBudget.bridge, "income", "Pulls fund-raised money up to cover salaries under 5000 Personnel. Not regular church income.")}
      <div className="mt-4" />
      {renderCategoryTable("Operating Expense", totals.opExpenseCats, lineByCat, trendByCat, totals.annual.opExpense, totals.ytdActual.opExpense, totals.ytdBudget.opExpense, "expense")}
      <div className="mt-4" />
      {renderCategoryTable("Designated Expense (Fund-raised)", totals.designatedCats, lineByCat, trendByCat, totals.annual.designated, totals.ytdActual.designated, totals.ytdBudget.designated, "expense", "Fund-raised church-planting costs. Tracked separately so they don't distort operational health.")}
    </>
  );
}

function renderCategoryTable(
  title: string,
  cats: Category[],
  lineByCat: Map<string, SnapshotLine>,
  trendByCat: Map<string, number[]>,
  annualTotal: number,
  ytdActualTotal: number,
  ytdBudgetTotal: number,
  kind: "income" | "expense",
  caption?: string,
) {
  const variancePositiveIsGood = kind === "income";
  const varianceClass = (n: number) =>
    n === 0
      ? "text-muted-foreground"
      : (n > 0) === variancePositiveIsGood
        ? "text-muted-foreground"
        : "text-destructive";
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-x-auto">
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-baseline justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
          <span className="text-xs text-muted-foreground">{cats.length} categories</span>
        </div>
        {caption && <p className="text-[11px] text-muted-foreground mt-0.5">{caption}</p>}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="text-left px-3 py-2">Category</th>
            <th className="text-right px-3 py-2">Annual budget</th>
            <th className="text-right px-3 py-2">YTD actual</th>
            <th className="text-right px-3 py-2">YTD budget</th>
            <th className="text-right px-3 py-2">vs. YTD budget</th>
            <th className="text-right px-3 py-2">vs. annual</th>
            <th className="text-left px-3 py-2">Trend</th>
          </tr>
        </thead>
        <tbody>
          {cats.map((c) => {
            const line = lineByCat.get(c.id);
            const ytdActual = line ? Number(line.ytd_actual) : 0;
            const ytdBudget = line ? Number(line.ytd_budget) : 0;
            const annual = Number(c.annual_budget);
            // For income: actual > budget is GOOD; for expense: actual > budget is BAD
            const vsYtd = kind === "income" ? ytdActual - ytdBudget : ytdBudget - ytdActual;
            const vsAnnual = kind === "income" ? ytdActual - annual : annual - ytdActual;
            const trend = trendByCat.get(c.id) ?? [];
            return (
              <tr key={c.id} className="border-b border-border/40 hover:bg-background/40">
                <td className="px-3 py-1.5 font-medium">{c.name}</td>
                <td className="text-right tabular-nums px-3">{fmt(annual)}</td>
                <td className="text-right tabular-nums px-3">{fmt(ytdActual)}</td>
                <td className="text-right tabular-nums px-3 text-muted-foreground">{fmt(ytdBudget)}</td>
                <td className={`text-right tabular-nums px-3 ${varianceClass(vsYtd)}`}>{fmt(vsYtd)}</td>
                <td className={`text-right tabular-nums px-3 ${varianceClass(vsAnnual)}`}>{fmt(vsAnnual)}</td>
                <td className="px-3"><Sparkline values={trend} /></td>
              </tr>
            );
          })}
          {cats.length === 0 && (
            <tr><td colSpan={7} className="text-center py-8 text-muted-foreground text-sm">No {title.toLowerCase()} categories yet.</td></tr>
          )}
        </tbody>
        {cats.length > 0 && (
          <tfoot>
            <tr className="font-semibold bg-background/40">
              <td className="px-3 py-2">Total</td>
              <td className="text-right tabular-nums px-3">{fmt(annualTotal)}</td>
              <td className="text-right tabular-nums px-3">{fmt(ytdActualTotal)}</td>
              <td className="text-right tabular-nums px-3 text-muted-foreground">{fmt(ytdBudgetTotal)}</td>
              <td className={`text-right tabular-nums px-3 ${varianceClass(kind === "income" ? ytdActualTotal - ytdBudgetTotal : ytdBudgetTotal - ytdActualTotal)}`}>
                {fmt(kind === "income" ? ytdActualTotal - ytdBudgetTotal : ytdBudgetTotal - ytdActualTotal)}
              </td>
              <td className={`text-right tabular-nums px-3 ${varianceClass(kind === "income" ? ytdActualTotal - annualTotal : annualTotal - ytdActualTotal)}`}>
                {fmt(kind === "income" ? ytdActualTotal - annualTotal : annualTotal - ytdActualTotal)}
              </td>
              <td></td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function Stat({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: string; tone?: "default" | "danger" }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xl font-display font-semibold tabular-nums mt-0.5 ${tone === "danger" ? "text-destructive" : ""}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="text-xs text-muted-foreground/40">—</span>;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const w = 80, h = 20;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} className="text-primary">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={pts} />
    </svg>
  );
}

/* ---------------- REPORTS ---------------- */

function ReportsTab({ year }: { year: number }) {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState<Report | null>(null);
  const [annualOpen, setAnnualOpen] = useState(false);
  const [annualMeta, setAnnualMeta] = useState<{ count: number; updatedAt: string | null; income: number; expense: number; designated: number }>({ count: 0, updatedAt: null, income: 0, expense: 0, designated: 0 });
  const [showDesignated, setShowDesignated] = useState(false);

  useEffect(() => { load(); }, [year]);

  async function load() {
    const { data } = await supabase.from("finance_reports").select("*")
      .eq("fiscal_year", year)
      .eq("report_type", "finance")
      .order("month", { ascending: true })
      .order("created_at", { ascending: false });
    setReports((data ?? []) as Report[]);
    const { data: catData } = await supabase
      .from("budget_categories")
      .select("annual_budget,updated_at,kind,classification")
      .eq("fiscal_year", year);
    const arr = (catData ?? []) as { annual_budget: number; updated_at: string | null; kind: "income" | "expense"; classification: string | null }[];
    const income = arr.filter((c) => c.kind === "income").reduce((s, c) => s + Number(c.annual_budget ?? 0), 0);
    const expense = arr
      .filter((c) => c.kind !== "income" && c.classification !== "designated_expense")
      .reduce((s, c) => s + Number(c.annual_budget ?? 0), 0);
    const designated = arr
      .filter((c) => c.classification === "designated_expense")
      .reduce((s, c) => s + Number(c.annual_budget ?? 0), 0);
    const latest = arr.reduce<string | null>((acc, c) => {
      if (!c.updated_at) return acc;
      return !acc || c.updated_at > acc ? c.updated_at : acc;
    }, null);
    setAnnualMeta({ count: arr.length, updatedAt: latest, income, expense, designated });
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${year}/${String(month).padStart(2, "0")}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("finance-reports").upload(path, file);
      if (upErr) throw upErr;
      const { data: inserted, error } = await supabase.from("finance_reports").insert({
        fiscal_year: year, month, label: label || null,
        file_path: path, file_name: file.name, mime_type: file.type,
        uploaded_by: user?.id,
        report_type: "finance",
      }).select().single();
      if (error) throw error;
      toast.success("Report uploaded");
      setOpen(false);
      setFile(null); setLabel("");
      await load();
      // Auto-prompt CSV import
      const isCsv = file.type === "text/csv" || file.name.toLowerCase().endsWith(".csv");
      if (isCsv && inserted) setImporting(inserted as Report);
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function download(r: Report) {
    const { data, error } = await supabase.storage.from("finance-reports").createSignedUrl(r.file_path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  }

  async function remove(r: Report) {
    if (!confirm(`Delete "${r.file_name}"?`)) return;
    await supabase.storage.from("finance-reports").remove([r.file_path]);
    await supabase.from("finance_reports").delete().eq("id", r.id);
    load();
  }

  const grouped = useMemo(() => {
    const m = new Map<number, Report[]>();
    reports.forEach((r) => {
      const arr = m.get(r.month) ?? [];
      arr.push(r);
      m.set(r.month, arr);
    });
    return m;
  }, [reports]);

  return (
    <>
      <div className="bg-surface border border-border rounded-2xl p-4 mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Annual budget — FY {year}</div>
          <div className="flex items-baseline gap-3 mt-0.5 flex-wrap">
            <div><span className="text-[11px] text-muted-foreground mr-1">Income</span><span className="text-lg font-display font-semibold tabular-nums text-emerald-600">{fmt(annualMeta.income)}</span></div>
            <div><span className="text-[11px] text-muted-foreground mr-1">Expense</span><span className="text-lg font-display font-semibold tabular-nums text-rose-600">{fmt(annualMeta.expense)}</span></div>
            <div><span className="text-[11px] text-muted-foreground mr-1">Net</span><span className={`text-lg font-display font-semibold tabular-nums ${annualMeta.income - annualMeta.expense < 0 ? "text-destructive" : ""}`}>{fmt(annualMeta.income - annualMeta.expense)}</span></div>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {annualMeta.count > 0
              ? <>{annualMeta.count} categories · last updated {annualMeta.updatedAt ? format(new Date(annualMeta.updatedAt), "MMM d, yyyy") : "—"}</>
              : <>Not imported yet — upload QBO's Budget Overview to seed annual budgets.</>}
          </div>
        </div>
        <Button size="sm" variant={annualMeta.count > 0 ? "outline" : "default"} onClick={() => setAnnualOpen(true)}>
          <Upload className="w-4 h-4 mr-1.5" /> {annualMeta.count > 0 ? "Re-upload annual budget" : "Upload annual budget"}
        </Button>
      </div>

      <div className="flex items-center justify-between mb-3 gap-3">
        <p className="text-xs text-muted-foreground max-w-2xl">
          Export <strong>Budget vs. Actuals — Fiscal Year-to-Date</strong> from QBO as <strong>CSV</strong> and upload it each month. The dashboard refreshes from the latest snapshot. Annual budgets come from the separate Annual budget import above.
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Upload className="w-4 h-4 mr-1.5" /> Upload report
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {MONTHS.map((m, i) => {
          const items = grouped.get(i + 1) ?? [];
          return (
            <div key={m} className="bg-surface border border-border rounded-2xl p-4 min-h-[8rem]">
              <div className="flex items-center justify-between mb-2">
                <div className="font-display font-semibold">{m} {year}</div>
                <div className="text-[11px] text-muted-foreground">{items.length} {items.length === 1 ? "file" : "files"}</div>
              </div>
              {items.length === 0 ? (
                <div className="text-xs text-muted-foreground/60 py-4 text-center">No reports</div>
              ) : (
                <div className="space-y-1.5">
                  {items.map((r) => {
                    const isCsv = r.mime_type === "text/csv" || r.file_name.toLowerCase().endsWith(".csv");
                    return (
                    <div key={r.id} className="flex items-center gap-2 group bg-background/40 rounded-lg px-2 py-1.5">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate">{r.label || r.file_name}</div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                          {format(new Date(r.created_at), "MMM d, yyyy")}
                          {r.imported_at ? (
                            <Badge variant="secondary" className="h-3.5 px-1 text-[9px]">Imported</Badge>
                          ) : isCsv ? (
                            <Badge variant="outline" className="h-3.5 px-1 text-[9px]">Not imported</Badge>
                          ) : (
                            <Badge variant="outline" className="h-3.5 px-1 text-[9px]">Storage only</Badge>
                          )}
                        </div>
                      </div>
                      {isCsv && (
                        <button onClick={() => setImporting(r)} className="opacity-60 hover:opacity-100 text-primary" title="Import to dashboard">
                          <Sparkles className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => download(r)} className="opacity-60 hover:opacity-100" title="Download">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => remove(r)} className="opacity-60 hover:opacity-100 text-destructive" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload monthly report</DialogTitle>
            <DialogDescription>CSV from QBO Budget vs. Actuals — Fiscal Year-to-Date.</DialogDescription>
          </DialogHeader>
          <form onSubmit={upload} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Year</Label>
                <Input value={year} disabled />
              </div>
              <div className="space-y-2">
                <Label>As-of month</Label>
                <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Label (optional)</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. April FYTD" />
            </div>
            <div className="space-y-2">
              <Label>File</Label>
              <Input type="file" accept=".csv,.pdf,.xlsx,.xls,text/csv,application/pdf"
                required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <p className="text-[11px] text-muted-foreground">CSV recommended. PDF/XLSX stored for reference only.</p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={uploading || !file}>{uploading ? "Uploading…" : "Upload"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {importing && (
        <SnapshotReviewDialog
          open={!!importing}
          onOpenChange={(o) => { if (!o) setImporting(null); }}
          reportId={importing.id}
          filePath={importing.file_path}
          fileName={importing.file_name}
          defaultFiscalYear={importing.fiscal_year}
          defaultMonth={importing.month}
          onApplied={() => { setImporting(null); load(); }}
        />
      )}

      <AnnualBudgetDialog
        open={annualOpen}
        onOpenChange={setAnnualOpen}
        fiscalYear={year}
        onApplied={() => { setAnnualOpen(false); load(); }}
      />
    </>
  );
}
