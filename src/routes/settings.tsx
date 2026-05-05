import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user, roles } = useAuth();
  return (
    <AppShell>
      <h1 className="text-3xl font-display font-bold">Settings</h1>
      <div className="mt-8 bg-surface border border-border rounded-2xl p-6 max-w-2xl">
        <h2 className="font-display font-semibold mb-4">Your account</h2>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Email</dt>
            <dd>{user?.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Role</dt>
            <dd className="font-medium capitalize">{roles.join(", ") || "—"}</dd>
          </div>
        </dl>
      </div>
    </AppShell>
  );
}
