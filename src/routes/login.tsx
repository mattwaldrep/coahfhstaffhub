import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [loading, user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        // If a session was returned immediately (auto-confirm), go home.
        if (data.session) {
          navigate({ to: "/" });
        } else {
          setPendingConfirmEmail(email);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/" });
      }
    } catch (err: any) {
      const msg = err.message ?? "Authentication failed";
      if (/email not confirmed/i.test(msg)) {
        toast.error("Please confirm your email first — check your inbox.");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  if (pendingConfirmEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center space-y-4">
          <div className="font-display font-bold text-2xl tracking-tight">COAH Forest Hills Staff Hub</div>
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-soft space-y-3">
            <h1 className="font-display font-semibold text-lg">Check your email</h1>
            <p className="text-sm text-muted-foreground">
              We sent a confirmation link to <span className="text-foreground font-medium">{pendingConfirmEmail}</span>.
              Click the link to activate your account, then sign in.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => { setPendingConfirmEmail(null); setMode("signin"); setPassword(""); }}
            >
              Back to sign in
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="font-display font-bold text-2xl tracking-tight">
            COAH Forest Hills Staff Hub
          </Link>
          <p className="text-sm text-muted-foreground mt-2">
            {mode === "signin" ? "Sign in to continue" : "Create your account"}
          </p>
        </div>
        <form onSubmit={submit} className="bg-surface border border-border rounded-2xl p-6 space-y-4 shadow-soft">
          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="w-full text-xs text-muted-foreground hover:text-foreground"
          >
            {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
