import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/sunday-review")({
  component: SundayReviewPage,
});

type Review = {
  id: string;
  week_of: string;
  attendance: number | null;
  giving: number | null;
  first_time_guests: number | null;
  highlights: string | null;
  lowlights: string | null;
  prayer_needs: string | null;
  follow_ups: string | null;
};

const schema = z.object({
  week_of: z.string().min(1, "Pick a Sunday"),
  attendance: z.coerce.number().int().min(0).max(10000).nullable(),
  giving: z.coerce.number().min(0).max(10_000_000).nullable(),
  first_time_guests: z.coerce.number().int().min(0).max(1000).nullable(),
  highlights: z.string().max(4000).optional().nullable(),
  lowlights: z.string().max(4000).optional().nullable(),
  prayer_needs: z.string().max(4000).optional().nullable(),
  follow_ups: z.string().max(4000).optional().nullable(),
});

function lastSundayISO() {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day); // back to Sunday
  return d.toISOString().slice(0, 10);
}

function SundayReviewPage() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    week_of: lastSundayISO(),
    attendance: "",
    giving: "",
    first_time_guests: "",
    highlights: "",
    lowlights: "",
    prayer_needs: "",
    follow_ups: "",
  });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sunday_reviews")
      .select("*")
      .order("week_of", { ascending: false })
      .limit(12);
    if (error) toast.error(error.message);
    setReviews((data ?? []) as Review[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("sunday-reviews")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sunday_reviews" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  // Pre-fill form when an existing entry matches selected week
  useEffect(() => {
    const match = reviews.find((r) => r.week_of === form.week_of);
    if (match) {
      setForm((f) => ({
        ...f,
        attendance: match.attendance?.toString() ?? "",
        giving: match.giving?.toString() ?? "",
        first_time_guests: match.first_time_guests?.toString() ?? "",
        highlights: match.highlights ?? "",
        lowlights: match.lowlights ?? "",
        prayer_needs: match.prayer_needs ?? "",
        follow_ups: match.follow_ups ?? "",
      }));
    }
  }, [form.week_of, reviews]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = schema.safeParse({
      week_of: form.week_of,
      attendance: form.attendance === "" ? null : form.attendance,
      giving: form.giving === "" ? null : form.giving,
      first_time_guests: form.first_time_guests === "" ? null : form.first_time_guests,
      highlights: form.highlights || null,
      lowlights: form.lowlights || null,
      prayer_needs: form.prayer_needs || null,
      follow_ups: form.follow_ups || null,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("sunday_reviews")
      .upsert(
        { ...parsed.data, submitted_by: user.id },
        { onConflict: "week_of" },
      );
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Sunday Review saved");
  };

  const trends = useMemo(() => {
    const sorted = [...reviews].sort((a, b) => a.week_of.localeCompare(b.week_of));
    const last = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    return {
      attendance: delta(last?.attendance, prev?.attendance),
      giving: delta(last?.giving, prev?.giving),
      guests: delta(last?.first_time_guests, prev?.first_time_guests),
    };
  }, [reviews]);

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Weekly</p>
          <h1 className="text-3xl font-display font-bold mt-1">Sunday Review</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Capture this Sunday's pulse. Submissions feed Tuesday's meeting agenda and the home dashboard trends.
          </p>
        </header>

        <div className="grid lg:grid-cols-3 gap-4 mb-8">
          <TrendCard label="Attendance" value={trends.attendance} />
          <TrendCard label="Giving" value={trends.giving} prefix="$" />
          <TrendCard label="First-time Guests" value={trends.guests} />
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          <form onSubmit={submit} className="lg:col-span-3 bg-surface border border-border rounded-2xl p-6 space-y-4">
            <h2 className="font-display font-semibold text-lg">New / edit submission</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Week of (Sunday)">
                <input
                  type="date"
                  value={form.week_of}
                  onChange={(e) => setForm((f) => ({ ...f, week_of: e.target.value }))}
                  className={inputCls}
                  required
                />
              </Field>
              <Field label="Attendance">
                <input
                  type="number"
                  min={0}
                  value={form.attendance}
                  onChange={(e) => setForm((f) => ({ ...f, attendance: e.target.value }))}
                  className={inputCls}
                />
              </Field>
              <Field label="Giving (USD)">
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.giving}
                  onChange={(e) => setForm((f) => ({ ...f, giving: e.target.value }))}
                  className={inputCls}
                />
              </Field>
              <Field label="First-time guests">
                <input
                  type="number"
                  min={0}
                  value={form.first_time_guests}
                  onChange={(e) => setForm((f) => ({ ...f, first_time_guests: e.target.value }))}
                  className={inputCls}
                />
              </Field>
            </div>
            <Field label="Highlights">
              <textarea
                rows={3}
                value={form.highlights}
                onChange={(e) => setForm((f) => ({ ...f, highlights: e.target.value }))}
                className={inputCls}
                maxLength={4000}
              />
            </Field>
            <Field label="Lowlights / friction">
              <textarea
                rows={3}
                value={form.lowlights}
                onChange={(e) => setForm((f) => ({ ...f, lowlights: e.target.value }))}
                className={inputCls}
                maxLength={4000}
              />
            </Field>
            <Field label="Prayer needs">
              <textarea
                rows={2}
                value={form.prayer_needs}
                onChange={(e) => setForm((f) => ({ ...f, prayer_needs: e.target.value }))}
                className={inputCls}
                maxLength={4000}
              />
            </Field>
            <Field label="Follow-ups for Tuesday">
              <textarea
                rows={2}
                value={form.follow_ups}
                onChange={(e) => setForm((f) => ({ ...f, follow_ups: e.target.value }))}
                className={inputCls}
                maxLength={4000}
              />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save review
              </Button>
            </div>
          </form>

          <aside className="lg:col-span-2 bg-surface border border-border rounded-2xl p-6">
            <h2 className="font-display font-semibold text-lg mb-4">Recent weeks</h2>
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : reviews.length === 0 ? (
              <div className="text-sm text-muted-foreground">No submissions yet.</div>
            ) : (
              <ul className="space-y-3">
                {reviews.map((r) => (
                  <li
                    key={r.id}
                    className="border border-border rounded-lg p-3 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setForm((f) => ({ ...f, week_of: r.week_of }))}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm">
                        {new Date(r.week_of + "T00:00").toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.attendance ?? "—"} att · ${r.giving?.toLocaleString() ?? "—"}
                      </div>
                    </div>
                    {r.highlights && (
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.highlights}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

const inputCls =
  "w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function delta(current: number | null | undefined, previous: number | null | undefined) {
  if (current == null) return { current: null as number | null, pct: null as number | null };
  if (previous == null || previous === 0) return { current, pct: null };
  return { current, pct: ((current - previous) / previous) * 100 };
}

function TrendCard({
  label,
  value,
  prefix = "",
}: {
  label: string;
  value: { current: number | null; pct: number | null };
  prefix?: string;
}) {
  const Icon = value.pct == null ? Minus : value.pct >= 0 ? TrendingUp : TrendingDown;
  const tone =
    value.pct == null
      ? "text-muted-foreground"
      : value.pct >= 0
        ? "text-emerald-600"
        : "text-amber-600";
  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-3xl font-display font-bold mt-2">
        {value.current == null ? "—" : `${prefix}${value.current.toLocaleString()}`}
      </div>
      <div className={`flex items-center gap-1 text-xs mt-2 ${tone}`}>
        <Icon className="w-3 h-3" />
        {value.pct == null ? "vs last week" : `${value.pct >= 0 ? "+" : ""}${value.pct.toFixed(1)}% vs last week`}
      </div>
    </div>
  );
}
