import { useState } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function BulletList({
  items,
  onChange,
  placeholder,
  editable,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  editable: boolean;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft("");
  };
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const update = (i: number, v: string) =>
    onChange(items.map((it, idx) => (idx === i ? v : it)));

  return (
    <div className="space-y-2">
      {items.length === 0 && !editable && (
        <p className="text-sm text-muted-foreground italic">None</p>
      )}
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2 group">
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {editable ? (
              <>
                <Input
                  value={it}
                  onChange={(e) => update(i, e.target.value)}
                  className="h-8"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 opacity-70 hover:opacity-100"
                  onClick={() => remove(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <span className="text-sm">{it}</span>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <div className="flex gap-2">
          <Input
            value={draft}
            placeholder={placeholder ?? "Add item…"}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className="h-8"
          />
          <Button type="button" size="sm" variant="outline" onClick={add}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
