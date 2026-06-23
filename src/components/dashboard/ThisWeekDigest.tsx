import { useEffect, useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getThisWeekDigest, refreshThisWeekDigest } from "@/lib/weekly-digest.functions";

export function ThisWeekDigest() {
  const [paragraph, setParagraph] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setLoading(true);
    (getThisWeekDigest as any)()
      .then((r: any) => {
        setParagraph(r?.paragraph ?? null);
        setGeneratedAt(r?.generated_at ?? null);
      })
      .catch(() => setParagraph(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await (refreshThisWeekDigest as any)();
      load();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="col-span-12 bg-gradient-to-br from-primary/5 via-surface to-surface border border-border rounded-2xl p-6 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-display font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" /> This week
        </h2>
        <div className="flex items-center gap-3">
          {generatedAt && (
            <span className="text-[11px] text-muted-foreground">
              as of {formatDistanceToNow(new Date(generatedAt), { addSuffix: true })}
            </span>
          )}
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing || loading}
            className="text-muted-foreground hover:text-foreground transition disabled:opacity-50"
            title="Regenerate"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
      {loading ? (
        <div className="space-y-2">
          <div className="h-3 rounded bg-border/60 animate-pulse w-full" />
          <div className="h-3 rounded bg-border/60 animate-pulse w-11/12" />
          <div className="h-3 rounded bg-border/60 animate-pulse w-8/12" />
        </div>
      ) : paragraph ? (
        <p className="text-sm leading-relaxed text-foreground/90">{paragraph}</p>
      ) : (
        <p className="text-sm text-muted-foreground">No digest available right now.</p>
      )}
    </div>
  );
}
