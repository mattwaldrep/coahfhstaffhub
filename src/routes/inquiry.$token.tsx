import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/inquiry/$token")({
  component: InquiryPage,
});

type State = "loading" | "ready" | "submitted" | "notfound" | "error";

function InquiryPage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<State>("loading");
  const [churchName, setChurchName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    church_name: "",
    leader_name: "",
    leader_phone: "",
    leader_email: "",
    start_date: "",
    end_date: "",
    alternate_dates: "",
    vision: "",
    church_context: "",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/missions/inquiry/${token}`);
        if (cancelled) return;
        if (res.status === 404 || res.status === 400) {
          setState("notfound");
          return;
        }
        if (!res.ok) {
          setState("error");
          return;
        }
        const data = await res.json();
        setChurchName(data.church_name ?? "");
        setForm((f) => ({ ...f, church_name: data.church_name ?? "" }));
        setState(data.already_submitted ? "submitted" : "ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/missions/inquiry/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Submission failed");
        return;
      }
      setState("submitted");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            City On A Hill · Forest Hills
          </div>
          <h1 className="text-3xl font-display font-bold mt-2">
            Missions trip planning questionnaire
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Thanks for considering serving with us in Boston. This short form gives us
            a high-level understanding of the trip you're hoping to take.
          </p>
        </div>

        {state === "loading" && (
          <div className="text-sm text-muted-foreground">Loading…</div>
        )}

        {state === "notfound" && (
          <div className="border border-border rounded-2xl p-6 bg-surface">
            <h2 className="font-semibold">Link not recognized</h2>
            <p className="text-sm text-muted-foreground mt-1">
              This planning form link is invalid or expired. Please reach out to the
              COAH team so we can send you a fresh one.
            </p>
          </div>
        )}

        {state === "error" && (
          <div className="border border-border rounded-2xl p-6 bg-surface">
            <h2 className="font-semibold">Something went wrong</h2>
            <p className="text-sm text-muted-foreground mt-1">
              We couldn't load this form. Please try again in a moment.
            </p>
          </div>
        )}

        {state === "submitted" && (
          <div className="border border-border rounded-2xl p-6 bg-surface">
            <h2 className="font-semibold">Thanks — we've got it!</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Your responses for <strong>{churchName}</strong> have been received. The
              COAH team will be in touch shortly to schedule your planning call.
            </p>
          </div>
        )}

        {state === "ready" && (
          <form onSubmit={submit} className="space-y-5 bg-surface border border-border rounded-2xl p-6">
            <Field label="Church name" required>
              <Input value={form.church_name} onChange={(e) => setForm({ ...form, church_name: e.target.value })} required maxLength={200} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Primary contact name" required>
                <Input value={form.leader_name} onChange={(e) => setForm({ ...form, leader_name: e.target.value })} required maxLength={200} />
              </Field>
              <Field label="Primary contact phone" required>
                <Input value={form.leader_phone} onChange={(e) => setForm({ ...form, leader_phone: e.target.value })} required maxLength={50} />
              </Field>
            </div>
            <Field label="Email address" required>
              <Input type="email" value={form.leader_email} onChange={(e) => setForm({ ...form, leader_email: e.target.value })} required maxLength={255} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Target start date">
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </Field>
              <Field label="Target end date">
                <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </Field>
            </div>
            <Field label="Alternate dates you're considering" hint="Optional">
              <Textarea rows={2} value={form.alternate_dates} onChange={(e) => setForm({ ...form, alternate_dates: e.target.value })} maxLength={1000} />
            </Field>
            <Field
              label="Your vision and hope for the trip"
              required
              hint="Activities you have in mind, focus areas, anything important to your team."
            >
              <Textarea rows={5} value={form.vision} onChange={(e) => setForm({ ...form, vision: e.target.value })} required maxLength={4000} />
            </Field>
            <Field label="Tell us about your church and your context" required>
              <Textarea rows={5} value={form.church_context} onChange={(e) => setForm({ ...form, church_context: e.target.value })} required maxLength={4000} />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Submitting…" : "Submit"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({
  label, required, hint, children,
}: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
