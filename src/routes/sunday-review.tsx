import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/sunday-review")({
  component: SundayReviewPage,
});

type Review = {
  id: string;
  service_date: string;
  submitted_by: string;
  worship_rating: number | null;
  worship_notes: string | null;
  confession_rating: number | null;
  confession_notes: string | null;
  connect_rating: number | null;
  connect_notes: string | null;
  sermon_rating: number | null;
  sermon_notes: string | null;
  wins: string | null;
  opportunities: string | null;
};

const SECTIONS = [
  { key: "worship", label: "Musical worship" },
  { key: "confession", label: "Call & confession" },
  { key: "connect", label: "Connect moment / core values / ministry highlight" },
  { key: "sermon", label: "Sermon" },
] as const;

const ratingSchema = z.number().int().min(1).max(5).nullable();
const notesSchema = z.string().max(4000).nullable();

const schema = z.object({
  service_date: z.string().min(1, "Pick a service date"),
  worship_rating: ratingSchema,
  worship_notes: notesSchema,
  confession_rating: ratingSchema,
  confession_notes: notesSchema,
  connect_rating: ratingSchema,
  connect_notes: notesSchema,
  sermon_rating: ratingSchema,
  sermon_notes: notesSchema,
  wins: notesSchema,
  opportunities: notesSchema,
});

function lastSundayISO() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

type FormState = {
  service_date: string;
  worship_rating: number | null;
  worship_notes: string;
  confession_rating: number | null;
  confession_notes: string;
  connect_rating: number | null;
  connect_notes: string;
  sermon_rating: number | null;
  sermon_notes: string;
  wins: string;
  opportunities: string;
};

const emptyForm = (): FormState => ({
  service_date: lastSundayISO(),
  worship_rating: null,
  worship_notes: "",
  confession_rating: null,
  confession_notes: "",
  connect_rating: null,
  connect_notes: "",
  sermon_rating: null,
  sermon_notes: "",
  wins: "",
  opportunities: "",
});

function SundayReviewPage() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sunday_reviews")
      .select("*")
      .order("service_date", { ascending: false })
      .limit(20);
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = schema.safeParse({
      service_date: form.service_date,
      worship_rating: form.worship_rating,
      worship_notes: form.worship_notes || null,
      confession_rating: form.confession_rating,
      confession_notes: form.confession_notes || null,
      connect_rating: form.connect_rating,
      connect_notes: form.connect_notes || null,
      sermon_rating: form.sermon_rating,
      sermon_notes: form.sermon_notes || null,
      wins: form.wins || null,
      opportunities: form.opportunities || null,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("sunday_reviews")
      .upsert({ ...parsed.data, submitted_by: user.id }, { onConflict: "service_date,submitted_by" });
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(isEditing ? "Review updated" : "Review submitted");
      setForm(emptyForm());
    }
  };

  const isEditing = reviews.some(
    (r) => r.service_date === form.service_date && r.submitted_by === user?.id,
  );

  const loadIntoForm = (r: Review) => {
    setForm({
      service_date: r.service_date,
      worship_rating: r.worship_rating,
      worship_notes: r.worship_notes ?? "",
      confession_rating: r.confession_rating,
      confession_notes: r.confession_notes ?? "",
      connect_rating: r.connect_rating,
      connect_notes: r.connect_notes ?? "",
      sermon_rating: r.sermon_rating,
      sermon_notes: r.sermon_notes ?? "",
      wins: r.wins ?? "",
      opportunities: r.opportunities ?? "",
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Weekly</p>
          <h1 className="text-3xl font-display font-bold mt-1">Worship Service Review</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reflect on Sunday's service. Submissions feed Tuesday's meeting agenda.
          </p>
        </header>

        <div className="grid lg:grid-cols-5 gap-6">
          <form
            onSubmit={submit}
            className="lg:col-span-3 bg-surface border border-border rounded-2xl p-6 space-y-6"
          >
            <Field label="Date of service">
              <input
                type="date"
                value={form.service_date}
                onChange={(e) => setForm((f) => ({ ...f, service_date: e.target.value }))}
                className={inputCls}
                required
              />
            </Field>

            {SECTIONS.map((s) => (
              <div key={s.key} className="space-y-3">
                <div>
                  <div className="text-sm font-medium">How was the {s.label.toLowerCase()}?</div>
                  <RatingScale
                    value={form[`${s.key}_rating` as const] as number | null}
                    onChange={(v) =>
                      setForm((f) => ({ ...f, [`${s.key}_rating`]: v }) as FormState)
                    }
                  />
                </div>
                <Field label="Any thoughts to share?">
                  <textarea
                    rows={2}
                    value={form[`${s.key}_notes` as const] as string}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [`${s.key}_notes`]: e.target.value }) as FormState)
                    }
                    className={inputCls}
                    maxLength={4000}
                  />
                </Field>
              </div>
            ))}

            <Field label="Wins?">
              <textarea
                rows={3}
                value={form.wins}
                onChange={(e) => setForm((f) => ({ ...f, wins: e.target.value }))}
                className={inputCls}
                maxLength={4000}
              />
            </Field>

            <Field label="Opportunities for improvement?">
              <textarea
                rows={3}
                value={form.opportunities}
                onChange={(e) => setForm((f) => ({ ...f, opportunities: e.target.value }))}
                className={inputCls}
                maxLength={4000}
              />
            </Field>

            <div className="flex justify-end items-center gap-2">
              {isEditing && (
                <>
                  <span className="text-xs text-muted-foreground mr-auto">
                    Editing existing submission for this date
                  </span>
                  <Button type="button" variant="ghost" onClick={() => setForm(emptyForm())}>
                    New review
                  </Button>
                </>
              )}
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isEditing ? "Update review" : "Submit review"}
              </Button>
            </div>
          </form>

          <aside className="lg:col-span-2 bg-surface border border-border rounded-2xl p-6">
            <h2 className="font-display font-semibold text-lg mb-4">Recent submissions</h2>
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : reviews.length === 0 ? (
              <div className="text-sm text-muted-foreground">No submissions yet.</div>
            ) : (
              <ul className="space-y-3">
                {reviews.map((r) => {
                  const ratings = [r.worship_rating, r.confession_rating, r.connect_rating, r.sermon_rating].filter(
                    (n): n is number => typeof n === "number",
                  );
                  const avg = ratings.length
                    ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)
                    : "—";
                  return (
                    <li key={r.id} className="border border-border rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-sm">
                          {new Date(r.service_date + "T00:00").toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </div>
                        <div className="text-xs text-muted-foreground">avg {avg}/5</div>
                      </div>
                      {r.wins && (
                        <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          <span className="font-medium text-foreground">Wins: </span>
                          {r.wins}
                        </div>
                      )}
                      {r.opportunities && (
                        <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          <span className="font-medium text-foreground">Opps: </span>
                          {r.opportunities}
                        </div>
                      )}
                    </li>
                  );
                })}
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

function RatingScale({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-2 mt-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          className={cn(
            "w-10 h-10 rounded-full border text-sm font-medium transition-colors",
            value === n
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border hover:bg-muted",
          )}
        >
          {n}
        </button>
      ))}
      {value != null && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-muted-foreground hover:text-foreground ml-2"
        >
          Clear
        </button>
      )}
    </div>
  );
}
