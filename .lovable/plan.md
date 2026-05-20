# Assignable ad-hoc checklist items with rich context

Make each ad-hoc checklist item on a calendar event assignable to a user as a task. Tasks (in the in-app action list and in Google Tasks) always include the parent event's name and date so they're never decontextualized.

## Behavior

- Each ad-hoc checklist row gets an **Assign** action (avatar + due date picker). Once assigned, the row shows assignee chip, due date, and Google-sync status — converted from a plain checkbox into a task card.
- Completion is **fully two-way** between: the checklist item, the linked `action_item`, and the Google Task. Toggling any one updates the other two.
- Unassigning removes the linked task (with confirm if it was already pushed to Google).

## Title & notes format

- **Title** (shown in app + Google Tasks): `{Event title} ({date}) — {item label}`
  - Example: `Tuesday Bible Study (Nov 12) — Arrange childcare`
  - For recurring events, the date is the specific occurrence the checklist belongs to.
- **Notes**: event title, start date/time, location (if any), then a deep link back to the event:
  `Open in CoaH: https://<app>/calendar?event={eventId}`

## Schema changes

Add to `event_checklist_items`:
- `assignee_id uuid` — FK to `auth.users`
- `due_date date` — optional
- `action_item_id uuid` — links to the synced `action_items` row
- `created_by uuid`

Add to `action_items`:
- `source_event_id uuid` — back-ref to the calendar event
- `source_checklist_item_id uuid` — back-ref to the checklist row

The existing `google_task_id` / `google_task_pushed_at` on `action_items` stays as the Google sync handle. The existing 15-min Google sync cron continues to pull completion back — when it flips `action_items.completed`, a trigger mirrors that to `event_checklist_items.done`.

## Sync logic

A single Postgres trigger keeps `event_checklist_items.done` and `action_items.completed` in lockstep when they're linked, in either direction. The existing Google Tasks 15-min poller already updates `action_items.completed`, so Google → app → checklist propagates for free.

When assigning:
1. Create `action_items` row with the composed title + notes, `assignee_id`, `due_date`, back-refs to event & checklist item.
2. Update the checklist row with `assignee_id`, `due_date`, `action_item_id`.
3. Call existing `autoPushIfEnabled` so it lands in Google Tasks if the assignee has the integration on.

When unassigning: delete the `action_items` row (Google task remains — Google API doesn't reliably support deletion across users without re-auth; we mark it complete instead and surface a toast).

When the checklist item's label is edited after assignment: update the linked `action_items.title` (and re-push to Google if already pushed, via a PATCH to the existing Google task).

## UI changes (`src/routes/calendar.tsx`)

In the "Ad-hoc checklist" section of the event drawer:
- Each row becomes a compact card: checkbox · label · assignee avatar/name · due date · small "Google" icon if pushed.
- Right-side menu: **Assign…** (opens a popover with user search + date picker), **Unassign**, **Delete**.
- Show toast when assigning: "Pushed to Sarah's Google Tasks" if auto-push fires.

## Server functions (new file `src/lib/checklist-tasks.functions.ts`)

- `assignChecklistItem({ checklistItemId, assigneeId, dueDate })` — composes title/notes from the event, inserts `action_items`, links it, runs auto-push.
- `unassignChecklistItem({ checklistItemId })` — unlinks and removes the action item.
- `updateChecklistItemAssignment({ checklistItemId, assigneeId?, dueDate? })` — updates both rows in sync.

All use `requireSupabaseAuth` and `core` role checks (matching existing checklist policies).

## Files touched

- **Migration** — schema additions + trigger + RLS updates
- `src/routes/calendar.tsx` — new assign UI on each checklist row
- `src/lib/checklist-tasks.functions.ts` — new
- `src/server/google-tasks.functions.ts` — small helper to update an existing Google task's title/notes when the checklist label changes
- `src/integrations/supabase/types.ts` — auto-regenerates from migration

## Not in scope

- Bulk assigning multiple checklist items at once (can follow if useful).
- Assigning items from checklist *templates* — only ad-hoc items per your earlier note. Templated items stay shared/non-personal.
- Deleting a Google Task on unassign (Google API limits make this unreliable across other users' accounts; we mark complete instead).
