import { format, formatDistanceToNow } from "date-fns";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteTouchpoint as defaultDeleteTouchpoint } from "@/lib/pastoral-care.functions";

export type TextTouchpoint = {
  id: string;
  pco_person_id: string;
  user_id: string;
  user_name?: string | null;
  kind: string;
  note: string | null;
  direction: "outbound" | "inbound" | null;
  created_at: string;
};

export function TextThread({
  personName,
  touchpoints,
  onChanged,
  deleteTouchpoint = defaultDeleteTouchpoint,
}: {
  personName: string;
  touchpoints: TextTouchpoint[];
  onChanged?: () => void;
  deleteTouchpoint?: typeof defaultDeleteTouchpoint;
}) {
  if (touchpoints.length === 0) return null;

  // Oldest -> newest for chat ordering
  const ordered = [...touchpoints].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const firstName = personName.split(/\s+/)[0] ?? personName;

  return (
    <div className="space-y-1.5">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        Text thread
      </div>
      <div className="space-y-1.5 bg-background/40 border border-border rounded-lg p-2.5">
        {ordered.map((t) => {
          const outbound = t.direction === "outbound";
          const inbound = t.direction === "inbound";
          // Legacy text touchpoints without a direction render centered/neutral.
          const align = outbound ? "items-end" : inbound ? "items-start" : "items-center";
          const bubble = outbound
            ? "bg-[oklch(0.55_0.15_280)]/15 border-[oklch(0.55_0.15_280)]/30"
            : inbound
              ? "bg-surface border-border"
              : "bg-background border-border";
          return (
            <div key={t.id} className={`flex flex-col ${align} group`}>
              <div
                className={`max-w-[85%] border rounded-2xl px-3 py-1.5 ${bubble} relative`}
              >
                {t.note ? (
                  <div className="text-xs whitespace-pre-wrap">{t.note}</div>
                ) : (
                  <div className="text-xs text-muted-foreground italic">(no message body)</div>
                )}
                <button
                  onClick={async () => {
                    if (!confirm("Delete this message from the thread?")) return;
                    try {
                      await deleteTouchpoint({ data: { id: t.id } });
                      onChanged?.();
                    } catch (e: any) {
                      toast.error(e?.message ?? "Failed");
                    }
                  }}
                  className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition bg-background border border-border rounded-full p-0.5 hover:text-destructive"
                  title="Delete"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5 px-1">
                {outbound
                  ? `${t.user_name ?? "Elder"} · ${formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}`
                  : inbound
                    ? `${firstName} · ${format(new Date(t.created_at), "MMM d, h:mm a")}${t.user_name ? ` · logged by ${t.user_name}` : ""}`
                    : `${t.user_name ?? "Elder"} · ${format(new Date(t.created_at), "MMM d, h:mm a")}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
