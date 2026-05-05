import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Sparkles, Home, CalendarDays, Users, Settings as SettingsIcon, ClipboardList, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/meeting", label: "Meeting", icon: ClipboardList },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/missions", label: "Missions", icon: Users },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { user, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  const initials = (user.email ?? "??").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <nav className="container mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="font-display font-bold text-lg tracking-tight">
              COAH Staff Hub
            </Link>
            <ul className="hidden md:flex items-center gap-6 text-sm">
              {NAV.map((n) => {
                const active = pathname === n.to || (n.to !== "/" && pathname.startsWith(n.to));
                return (
                  <li key={n.to}>
                    <Link
                      to={n.to}
                      className={cn(
                        "transition-colors",
                        active ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {n.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => signOut()}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Sign out
            </button>
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
              {initials}
            </div>
          </div>
        </nav>
      </header>

      <main className="container mx-auto px-6 py-10">{children}</main>

      {/* AI Assistant FAB */}
      <button
        onClick={() => setAiOpen(true)}
        aria-label="Open AI assistant"
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
      >
        <Sparkles className="w-6 h-6" />
      </button>

      {aiOpen && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setAiOpen(false)}>
          <div className="absolute inset-0 bg-foreground/10 backdrop-blur-sm" />
          <aside
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md bg-surface border-l border-border shadow-xl flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <h2 className="font-display font-semibold">Ask the Hub</h2>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setAiOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex-1 p-6 text-sm text-muted-foreground">
              The AI assistant will read across meetings, calendar, missions, and reports to answer your questions. Coming online with the AI module.
            </div>
            <div className="p-4 border-t border-border">
              <input
                disabled
                placeholder="Ask anything about the hub…"
                className="w-full bg-muted rounded-lg px-3 py-2 text-sm border border-border outline-none"
              />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
