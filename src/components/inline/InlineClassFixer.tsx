import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClassEventLike {
  id: string;
  title: string;
  leader_name: string | null;
  leader_not_needed: boolean;
  childcare_needed: boolean;
  childcare_arranged: boolean;
}

interface InlineClassFixerProps {
  event: ClassEventLike;
  gaps: string[];
  /** Optional: refresh callback to re-fetch after saving. */
  onSaved?: () => void;
  className?: string;
}

/**
 * One-click inline editor for class events on the dashboard / meeting alerts.
 * Lets staff assign a teacher or mark childcare arranged without opening the
 * full event dialog in /calendar.
 *
 * Note: this writes the same teacher / childcare flag to every occurrence of
 * a recurring class (because they share an event row). Per-occurrence
 * overrides will land in Phase 2 with the recurring-class roster.
 */
export function InlineClassFixer({ event, gaps, onSaved, className }: InlineClassFixerProps) {
  const [open, setOpen] = useState(false);
  const [teacher, setTeacher] = useState(event.leader_name ?? "");
  const [leaderNotNeeded, setLeaderNotNeeded] = useState(event.leader_not_needed);
  const [needsChildcare, setNeedsChildcare] = useState(event.childcare_needed);
  const [arranged, setArranged] = useState(event.childcare_arranged);
  const [saving, setSaving] = useState(false);

  const teacherMissing = gaps.includes("teacher");
  const childcareMissing = gaps.includes("childcare arrangement");

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("calendar_events")
      .update({
        leader_name: teacher.trim() || null,
        leader_not_needed: leaderNotNeeded,
        childcare_needed: needsChildcare,
        childcare_arranged: needsChildcare ? arranged : false,
      })
      .eq("id", event.id);
    setSaving(false);
    if (error) {
      toast.error("Couldn't save", { description: error.message });
      return;
    }
    toast.success("Updated");
    setOpen(false);
    onSaved?.();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded",
            "hover:bg-warning/10 text-warning transition-colors",
            className,
          )}
          aria-label={`Fix ${event.title}`}
        >
          <Pencil className="w-3 h-3" />
          <span>Needs {gaps.join(" + ")}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-4 space-y-3">
        <div>
          <div className="font-medium text-sm truncate">{event.title}</div>
          <div className="text-xs text-muted-foreground">Quick assign — no need to open the calendar.</div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="inline-teacher" className="text-xs">
            Teacher
            {teacherMissing && <span className="text-warning ml-1">·  needed</span>}
          </Label>
          <Input
            id="inline-teacher"
            value={teacher}
            onChange={(e) => setTeacher(e.target.value)}
            placeholder="Who's teaching?"
            autoFocus={teacherMissing}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="inline-cc-needed" className="text-xs">Needs childcare</Label>
          <Switch id="inline-cc-needed" checked={needsChildcare} onCheckedChange={setNeedsChildcare} />
        </div>

        {needsChildcare && (
          <div className="flex items-center justify-between">
            <Label htmlFor="inline-cc-arranged" className="text-xs">
              Childcare arranged
              {childcareMissing && <span className="text-warning ml-1">· needed</span>}
            </Label>
            <Switch id="inline-cc-arranged" checked={arranged} onCheckedChange={setArranged} />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
