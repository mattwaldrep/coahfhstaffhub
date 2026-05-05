import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/elder/settings")({
  component: ElderSettings,
});

function ElderSettings() {
  const { isFullElder } = useAuth();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-display font-semibold">Elder settings</h2>
        <p className="text-sm text-muted-foreground">
          Configure briefing and recap emails for elder meetings.
        </p>
      </div>
      <div className="bg-surface border border-border rounded-2xl p-5 space-y-3">
        <div className="text-sm font-medium">Automated communications</div>
        <p className="text-xs text-muted-foreground">
          Briefing emails go out the day before each meeting; recaps go out the morning after.
          Two versions are sent: one for full elders (includes Executive Session content) and one for elder candidates (standard content only).
        </p>
        <p className="text-xs text-muted-foreground">
          The cron hooks <code>/api/public/hooks/elder-briefing</code> and <code>/api/public/hooks/elder-recap</code> trigger sends; configure them in your scheduler with the shared <code>CRON_SHARED_SECRET</code>.
        </p>
      </div>
      {!isFullElder && (
        <div className="text-xs text-muted-foreground">
          Some configuration is reserved for full elders.
        </div>
      )}
    </div>
  );
}
