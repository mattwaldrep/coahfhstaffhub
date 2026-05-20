## Goal

Create reusable **checklist templates** (e.g., "Pot Luck setup", "Class week prep") and attach them to any event or class series. For recurring classes, completion is tracked **per week**.

## Tables (new)

- **`checklist_templates`** — name, description, created_by
- **`checklist_template_items`** — template_id, label, position
- **`event_template_attachments`** — event_id + template_id (link table; live attachment)
- **`event_template_item_state`** — event_id + template_item_id + occurrence_date + done
  - `occurrence_date` is the date of that specific week's occurrence (for a one-off event, it equals the event's own date)
  - Composite unique key on (event_id, template_item_id, occurrence_date)

Existing `event_checklist_items` stays — it continues to hold one-off ad-hoc items added directly to a single event.

## How templates resolve at view time

For an event occurrence on date D, the rendered checklist = 

1. Ad-hoc items from `event_checklist_items` (existing behavior)
2. Plus: for each attached template, all `checklist_template_items` joined to the per-occurrence state row keyed by (event_id, item_id, D). Missing state row → `done = false`.

Checking a template item creates/updates one row in `event_template_item_state` for that occurrence_date only — next week starts fresh.

## UI

**1. New page `/settings/checklists`** (core role)
- List all templates
- Create / edit / delete templates with their item lists
- Reorderable items (drag or up/down)

**2. Calendar event dialog (`src/routes/calendar.tsx`)**
Add a "Templates" section above the existing Readiness checklist:
- Multi-select of available templates → writes to `event_template_attachments`
- Renders attached template items grouped by template name, each with a checkbox bound to per-occurrence state
- For non-recurring events, occurrence_date = the event's start date
- For recurring events viewed from a specific date chip, pass that occurrence_date down (calendar already has occurrence_date in EventChip)

**3. Class series dialog (`src/routes/calendar_.classes.tsx`)**
Add the same "Templates" multi-select. Saving writes attachments against the series' linked `calendar_event_id`.

## Readiness scoring (`src/lib/event-readiness.ts`)

Update `checklist_total` and `checklist_done` calculations everywhere they're computed:

- Total = ad-hoc items + sum of template items across attached templates
- Done = ad-hoc items done + per-occurrence done states for template items

For event-level summaries (no specific occurrence), use the next upcoming occurrence's date as the lookup key (matches what the calendar chips already do).

## Server functions (new `src/server/checklist-templates.functions.ts`)

- `listTemplates()` — for selectors
- `upsertTemplate({ id?, name, description, items })` — manage template + items atomically
- `deleteTemplate(id)`
- `setEventTemplates({ event_id, template_ids })` — replace attachments
- `setTemplateItemState({ event_id, item_id, occurrence_date, done })` — toggle per-occurrence state

All gated by `core` role.

## RLS

- Templates + items: readable by all authenticated, writable by core
- Attachments + per-occurrence state: same as calendar_events (readable by authenticated, writable by core)

## Out of scope (this turn)

- Drag-and-drop reorder (use up/down buttons instead — simpler, ships now)
- Assigning checklist items to specific people
- Notifications when items remain undone on the day of the event
