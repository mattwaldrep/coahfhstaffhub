import { type ReactNode, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { OnboardingProfileDialog } from "@/components/users/OnboardingProfileDialog";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    try { sessionStorage.removeItem("coah-ai-chat-v1"); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      const here = window.location.pathname + window.location.search;
      navigate({ to: "/login", search: here && here !== "/" ? { redirect: here } : {} });
    }
    if (!loading && user) {
      const saved = sessionStorage.getItem("post_login_redirect");
      if (saved) {
        sessionStorage.removeItem("post_login_redirect");
        if (saved.startsWith("/") && !saved.startsWith("//") && saved !== window.location.pathname) {
          navigate({ to: saved as any, replace: true });
        }
      }
    }
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>
    );
  }

  const initials = (user.email ?? "??").slice(0, 2).toUpperCase();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background text-foreground">
        <AppSidebar />
        <SidebarInset className="flex flex-col min-w-0">
          <header className="h-14 sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/85 backdrop-blur px-4">
            <SidebarTrigger />
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
          </header>

          <main className="flex-1 px-6 py-8 overflow-x-hidden">{children}</main>
          <OnboardingProfileDialog />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
