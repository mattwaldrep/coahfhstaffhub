## Goal
Let agenda items in both the staff meeting page and the elder meeting page contain markdown-style hyperlinks: `[label](https://example.com)` renders as a clickable link.

## Approach
Render-only change. The DB stays the same (`title` remains plain text). When displaying an agenda item title, parse it for `[label](url)` patterns and render those segments as `<a target="_blank" rel="noopener noreferrer">`. URLs are validated (must start with `http://`, `https://`, or `mailto:`) to avoid `javascript:` injection. Plain text without the pattern renders unchanged.

## Changes

1. **New helper** `src/lib/render-linked-text.tsx` — exports `<LinkedText value={string} />`. Splits the string on the `[label](url)` regex, returns a React fragment with `<a>` for valid links and plain text for the rest. Sanitizes URLs.

2. **`src/routes/meeting.tsx`** — In the agenda list (around line 328–355), replace the plain `{item.title}` render with `<LinkedText value={item.title} />`. Keep the click-to-toggle behavior on the row; stop link clicks from bubbling so clicking a link doesn't toggle done-state.

3. **`src/routes/elder.meetings.$meetingId.tsx`** — In `AgendaItemRow` (around line 249), same swap: render the title via `<LinkedText />`. Stop propagation on link clicks so it doesn't trigger row interactions.

4. **Input affordance** — Add a small hint under each "Add agenda item…" input on both pages: `Tip: use [label](https://…) for links`. No editor changes; users type the syntax directly.

## Out of scope
- No DB migration.
- No rich text editor swap.
- No changes to email recap rendering (recap continues to show raw text — can be a follow-up if you want).
