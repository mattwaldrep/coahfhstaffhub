import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

export type MentionUser = { id: string; name: string; email?: string | null };

export const MentionList = forwardRef<
  { onKeyDown: (props: { event: KeyboardEvent }) => boolean },
  { items: MentionUser[]; command: (item: { id: string; label: string }) => void }
>((props, ref) => {
  const [selected, setSelected] = useState(0);
  useEffect(() => setSelected(0), [props.items]);

  const select = (idx: number) => {
    const item = props.items[idx];
    if (item) props.command({ id: item.id, label: item.name });
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp") {
        setSelected((s) => (s + props.items.length - 1) % Math.max(1, props.items.length));
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelected((s) => (s + 1) % Math.max(1, props.items.length));
        return true;
      }
      if (event.key === "Enter") {
        select(selected);
        return true;
      }
      return false;
    },
  }));

  return (
    <div className="bg-surface border border-border rounded-lg shadow-md overflow-hidden text-sm min-w-[12rem]">
      {props.items.length === 0 ? (
        <div className="px-3 py-2 text-muted-foreground">No matches</div>
      ) : (
        props.items.map((it, i) => (
          <button
            key={it.id}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => select(i)}
            className={`w-full text-left px-3 py-1.5 ${
              i === selected ? "bg-[oklch(0.55_0.15_280)]/10 text-foreground" : "hover:bg-background/40"
            }`}
          >
            <div className="font-medium">{it.name}</div>
            {it.email && <div className="text-[11px] text-muted-foreground">{it.email}</div>}
          </button>
        ))
      )}
    </div>
  );
});
MentionList.displayName = "MentionList";
