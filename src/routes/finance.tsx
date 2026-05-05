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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Upload, Trash2, FileText, Download, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/finance")({
  component: FinancePage,
});

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

type Category = { id: string; name: string; fiscal_year: number; annual_budget: number; sort_order: number };
type Actual = { id: string; category_id: string; fiscal_year: number; month: number; amount: number; notes: string | null };
type Report = { id: string; fiscal_year: number; month: number; label: string | null; file_path: string; file_name: string; mime_type: string | null; created_at: string };

function FinancePage() { return <AppShell><Body /></AppShell>; }

function Body() {
  const { hasRole, loading } = useAuth();
  const isCore = hasRole("core");
  const [year, setYear] = useState<number>(new Date().getFullYear());

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

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Finance</h1>
          <p className="text-muted-foreground mt-1 text-sm">Track budget vs. actuals and store monthly reports.</p>
        </div>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => <SelectItem key={y} value={String(y)}>FY {y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="budget" className="w-full">
        <TabsList>
          <TabsTrigger value="budget">Budget vs. actuals</TabsTrigger>
          <TabsTrigger value="reports">Monthly reports</TabsTrigger>
        </TabsList>
        <TabsContent value="budget" className="mt-4"><BudgetTab year={year} /></TabsContent>
        <TabsContent value="reports" className="mt-4"><ReportsTab year={year} /></TabsContent>
      </Tabs>
    </>
  );
}

/* ---------------- BUDGET ---------------- */

function BudgetTab({ year }: { year: number }) {
  const [cats, setCats] = useState<Category[]>([]);
  const [actuals, setActuals] = useState<Actual[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ id?: string; name: string; annual_budget: string }>({ name: "", annual_budget: "" });
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [cellValue, setCellValue] = useState("");

  useEffect(() => { load(); }, [year]);

  async function load() {
    const [{ data: c }, { data: a }] = await Promise.all([
      supabase.from("budget_categories").select("*").eq("fiscal_year", year).order("sort_order").order("name"),
      supabase.from("budget_actuals").select("*").eq("fiscal_year", year),
    ]);
    setCats((c ?? []) as Category[]);
    setActuals((a ?? []) as Actual[]);
  }

  const actualMap = useMemo(() => {
    const m = new Map<string, number>();
    actuals.forEach((a) => m.set(`${a.category_id}-${a.month}`, Number(a.amount)));
    return m;
  }, [actuals]);

  const totals = useMemo(() => {
    const totalBudget = cats.reduce((s, c) => s + Number(c.annual_budget), 0);
    const totalActual = actuals.reduce((s, a) => s + Number(a.amount), 0);
    return { totalBudget, totalActual, variance: totalBudget - totalActual };
  }, [cats, actuals]);

  async function saveCategory(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      annual_budget: Number(form.annual_budget) || 0,
      fiscal_year: year,
    };
    const { error } = form.id
      ? await supabase.from("budget_categories").update(payload).eq("id", form.id)
      : await supabase.from("budget_categories").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    setOpen(false);
    setForm({ name: "", annual_budget: "" });
    load();
  }

  async function deleteCategory(id: string) {
    if (!confirm("Delete this category and all its monthly entries?")) return;
    const { error } = await supabase.from("budget_categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  async function commitCell(catId: string, month: number) {
    const amount = Number(cellValue) || 0;
    setEditingCell(null);
    const existing = actuals.find((a) => a.category_id === catId && a.month === month);
    if (existing) {
      if (amount === Number(existing.amount)) return;
      const { error } = await supabase.from("budget_actuals").update({ amount }).eq("id", existing.id);
      if (error) return toast.error(error.message);
      setActuals((prev) => prev.map((a) => (a.id === existing.id ? { ...a, amount } : a)));
    } else {
      if (amount === 0) return;
      const { data, error } = await supabase.from("budget_actuals").insert({
        category_id: catId, fiscal_year: year, month, amount,
      }).select().single();
      if (error) return toast.error(error.message);
      if (data) setActuals((prev) => [...prev, data as Actual]);
    }
  }

  return (
    <>
      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={() => { setForm({ name: "", annual_budget: "" }); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-1.5" /> New category
        </Button>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left px-3 py-2 sticky left-0 bg-surface z-10 min-w-[180px]">Category</th>
              <th className="text-right px-2 py-2">Budget</th>
              <th className="text-right px-2 py-2">YTD</th>
              <th className="text-right px-2 py-2">Variance</th>
              {MONTHS.map((m) => <th key={m} className="text-right px-2 py-2 font-normal">{m}</th>)}
              <th className="px-2 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {cats.length === 0 && (
              <tr><td colSpan={17} className="text-center py-8 text-sm text-muted-foreground">No categories yet for FY {year}.</td></tr>
            )}
            {cats.map((c) => {
              const ytd = MONTHS.reduce((s, _, i) => s + (actualMap.get(`${c.id}-${i + 1}`) ?? 0), 0);
              const variance = Number(c.annual_budget) - ytd;
              return (
                <tr key={c.id} className="border-b border-border/50 hover:bg-background/40">
                  <td className="px-3 py-1.5 sticky left-0 bg-surface z-10 font-medium cursor-pointer"
                    onClick={() => { setForm({ id: c.id, name: c.name, annual_budget: String(c.annual_budget) }); setOpen(true); }}>
                    {c.name}
                  </td>
                  <td className="text-right px-2 tabular-nums">{fmt(Number(c.annual_budget))}</td>
                  <td className="text-right px-2 tabular-nums">{fmt(ytd)}</td>
                  <td className={`text-right px-2 tabular-nums ${variance < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    {fmt(variance)}
                  </td>
                  {MONTHS.map((_, i) => {
                    const month = i + 1;
                    const key = `${c.id}-${month}`;
                    const val = actualMap.get(key) ?? 0;
                    const isEditing = editingCell === key;
                    return (
                      <td key={month} className="text-right px-1 py-0.5 tabular-nums">
                        {isEditing ? (
                          <input
                            autoFocus
                            type="number"
                            value={cellValue}
                            onChange={(e) => setCellValue(e.target.value)}
                            onBlur={() => commitCell(c.id, month)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitCell(c.id, month);
                              if (e.key === "Escape") setEditingCell(null);
                            }}
                            className="w-20 bg-background border border-primary rounded px-1.5 py-0.5 text-right text-xs"
                          />
                        ) : (
                          <button
                            onClick={() => { setEditingCell(key); setCellValue(val ? String(val) : ""); }}
                            className="w-full text-right px-1.5 py-1 hover:bg-background/60 rounded text-xs text-muted-foreground hover:text-foreground"
                          >
                            {val ? fmt(val) : "—"}
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteCategory(c.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {cats.length > 0 && (
            <tfoot>
              <tr className="font-medium bg-background/40">
                <td className="px-3 py-2 sticky left-0 bg-background/40 z-10">Total</td>
                <td className="text-right px-2 tabular-nums">{fmt(totals.totalBudget)}</td>
                <td className="text-right px-2 tabular-nums">{fmt(totals.totalActual)}</td>
                <td className={`text-right px-2 tabular-nums ${totals.variance < 0 ? "text-destructive" : ""}`}>{fmt(totals.variance)}</td>
                <td colSpan={13}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? "Edit category" : "New category"}</DialogTitle></DialogHeader>
          <form onSubmit={saveCategory} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Annual budget (FY {year})</Label>
              <Input type="number" step="0.01" value={form.annual_budget} onChange={(e) => setForm({ ...form, annual_budget: e.target.value })} />
            </div>
            <DialogFooter><Button type="submit">Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
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

  useEffect(() => { load(); }, [year]);

  async function load() {
    const { data } = await supabase.from("finance_reports").select("*")
      .eq("fiscal_year", year)
      .eq("report_type", "finance")
      .order("month", { ascending: true })
      .order("created_at", { ascending: false });
    setReports((data ?? []) as Report[]);
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
      const { error } = await supabase.from("finance_reports").insert({
        fiscal_year: year, month, label: label || null,
        file_path: path, file_name: file.name, mime_type: file.type,
        uploaded_by: user?.id,
      });
      if (error) throw error;
      toast.success("Report uploaded");
      setOpen(false);
      setFile(null); setLabel("");
      load();
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
      <div className="flex justify-end mb-3">
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
                  {items.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 group bg-background/40 rounded-lg px-2 py-1.5">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate">{r.label || r.file_name}</div>
                        <div className="text-[10px] text-muted-foreground">{format(new Date(r.created_at), "MMM d, yyyy")}</div>
                      </div>
                      <button onClick={() => download(r)} className="opacity-60 hover:opacity-100" title="Download">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => remove(r)} className="opacity-60 hover:opacity-100 text-destructive" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload finance report</DialogTitle></DialogHeader>
          <form onSubmit={upload} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Year</Label>
                <Input value={year} disabled />
              </div>
              <div className="space-y-2">
                <Label>Month</Label>
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
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Q1 P&L" />
            </div>
            <div className="space-y-2">
              <Label>File (PDF or XLSX)</Label>
              <Input type="file" accept=".pdf,.xlsx,.xls,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={uploading || !file}>{uploading ? "Uploading…" : "Upload"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
