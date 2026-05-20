## Goal

When you save a class series, it automatically appears on the calendar as a recurring event — no manual "Add to calendar" step. Each series owns one calendar event whose RRULE drives every weekly/biweekly/monthly occurrence.

## How it works

The calendar already supports rich recurrence on `calendar_events` (rrule + recurrence_end_date + excluded_dates) and the views expand RRULEs at render time. We'll piggyback on that instead of materializing dozens of rows per class.

```text
class_series  ──owns──▶  calendar_events (1 row, rrule)
                              │
                              └─ expanded weekly on the calendar
                              └─ skipped dates via excluded_dates
                              └─ per-occurrence notes already supported
```

## Changes

**1. Schema (migration on `class_series`)**
- `start_date date` — series start (DTSTART for the rrule)
- `end_date date NULL` — optional series end (UNTIL)
- `freq text` — `WEEKLY` | `MONTHLY`
- `interval int default 1` — every N weeks/months (covers biweekly)
- `byweekday text[]` — `['MO','WE']` etc.
- `bysetpos int NULL` — e.g. `2` for "2nd weekday of month"
- `excluded_dates date[] default '{}'` — skipped holidays/breaks
- `calendar_event_id uuid NULL` — the auto-generated event row
- Keep existing `weekday`, `start_time`, `end_time`, defaults — still used as the template.

**2. Classes page (`/calendar/classes`)**
Expand the add/edit form with a recurrence section:
- Date range (start required, end optional)
- Frequency: Weekly / Every N weeks (biweekly) / Monthly by weekday
- Weekday multi-select (Mon/Tue/…)
- "Position in month" selector when monthly (1st/2nd/3rd/4th/last)
- Skip dates list (add/remove specific dates)
- Time fields already exist

Add an Edit action (currently only add + archive + delete).

**3. Sync logic (new `src/server/class-series.functions.ts`)**
- `upsertClassSeries({...})` — writes the series, builds the RRULE from its fields, then upserts the matching `calendar_events` row:
  - `sub_calendar='classes'`, `category='Class'`, `class_series_id=<series.id>`
  - `title`, `leader_name`, `childcare_needed`, room (via `event_rooms`) all sourced from series defaults
  - `start_at`/`end_at` from start_date + start_time/end_time
  - `rrule`, `recurrence_end_date`, `excluded_dates` from the recurrence fields
- `deleteClassSeries(id)` — deletes the linked calendar event then the series.
- `archiveClassSeries(id, active)` — when archived, also clears `rrule` (or deletes the event) so it stops appearing on the calendar.

**4. Wire the page to use the new functions**
Replace the direct `supabase.from('class_series').insert/update/delete` calls with the server-fn calls so calendar sync happens server-side in one transaction.

## Notes & non-goals
- Per-occurrence overrides (e.g. "this Tuesday has a substitute teacher") stay as a Phase 2 item — same as today's recurring events.
- Existing class series rows get sensible defaults (weekly, no end date, no skips) so nothing breaks; you can edit them to refine.
- Readiness scoring is unchanged — class events still need teacher/room/childcare.
