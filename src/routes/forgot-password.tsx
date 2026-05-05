import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
    } catch (err: any) {
      toast.error(err.message ?? "Could not send reset email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="font-display font-bold text-2xl tracking-tight">
            COAH Forest Hills Staff Hub
          </Link>
          <p className="text-sm text-muted-foreground mt-2">Reset your password</p>
        </div>
        {sent ? (
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft space-y-3 text-center">
            <h1 className="font-display font-semibold text-lg">Check your email</h1>
            <p className="text-sm text-muted-foreground">
              If an account exists for <span className="text-foreground font-medium">{email}</span>,
              you'll receive a password reset link shortly.
            </p>
            <Link to="/login" className="inline-block text-xs text-muted-foreground hover:text-foreground">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="bg-surface border border-border rounded-2xl p-6 space-y-4 shadow-soft">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "…" : "Send reset link"}
            </Button>
            <Link to="/login" className="block text-center text-xs text-muted-foreground hover:text-foreground">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
