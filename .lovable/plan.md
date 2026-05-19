## Goal

When a calendar event's category is **Class**, prompt for a **Teacher** (reuses the existing Leader field) and a **Childcare** status. Never block creation, but surface clear reminders until both are resolved.

## Data model

Add two columns to `calendar_events`:

- `childcare_needed` (boolean, default `false`) — toggle: does this class need childcare?
- `childcare_arranged` (boolean, default `false`) — set true once arrangements are confirmed.

Teacher reuses the existing `leader_name` column (relabeled in the UI when category = Class). No schema change for teacher.

Derived "needs attention" rule for a class event:

```text
isClass = category === "Class"
missingTeacher = isClass && !leader_name
missingChildcare = isClass && childcare_needed && !childcare_arranged
needsAttention = missingTeacher || missingChildcare
```

## UI changes

**1. Event dialog (`src/routes/calendar.tsx`)**
- When `category === "Class"`:
  - Relabel the Leader input as **Teacher** with a subtle hint ("Required for classes — you can save without it but it will be flagged").
  - Show a **Childcare** block: toggle "This class needs childcare". When on, show a second toggle "Childcare arranged".
- Submit still succeeds with gaps. If gaps exist, show a non-blocking warning toast: *"Saved. Still needed: teacher / childcare arrangement."*

**2. Calendar views (month/week/agenda)**
- Class events with `needsAttention` get a small amber warning dot + tooltip listing what's missing.

**3. Home dashboard — Alerts card (`src/routes/index.tsx`)**
- Query upcoming class events with `needsAttention`. Render each as a row: event title, date, what's missing, link to edit.
- Empty state stays as today.

**4. Weekly staff meeting (`src/components/meeting/MeetingSections.tsx`)**
- New standing section **"Classes needing attention"** placed near the existing event sections. Lists class events in the next ~6 weeks with missing teacher or unarranged childcare. Same row format as dashboard, with quick-edit link to the calendar.

## Technical notes

- Schema: single migration adding `childcare_needed boolean not null default false` and `childcare_arranged boolean not null default false`. Existing rows backfill to defaults — safe.
- No RLS changes (existing `calendar_events` policies cover the new columns).
- All UI logic is presentational; reads come from the existing event queries — just include the two new columns and `category`/`leader_name`.
- TypeScript types regenerate automatically after migration.

## Out of scope

- No assignment/notification system (e.g. emailing a teacher). Just visual prompts.
- No childcare-volunteer roster — `childcare_arranged` is a manual flag the user sets when arrangements exist outside the app.
