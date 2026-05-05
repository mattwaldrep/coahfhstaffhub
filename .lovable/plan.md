## Goal
Restructure the weekly staff meeting around a fixed standing agenda, with each section pulling live data instead of being free-form items.

## New meeting layout

The meeting page becomes a vertical stack of **standing sections** (always present, in order), followed by the existing free-form agenda for "Items To Discuss," then Action Items + Notes + Transcript.

Each standing section is a collapsible card with its own live content.

### 1. Devotional
Simple section with a notes textarea (autosaves to a per-meeting `section_notes` JSON column). No data pull.

### 2. Lead Like Jesus
Same as Devotional — notes-only section.

### 3. Recurring Agenda Items (header / divider)
Just a visual section break introducing the data-driven items below.

### 4. Sunday Review
Pulls the most recent `sunday_reviews` row (the prior Sunday). Shows ratings (worship/sermon/connect/confession) as a compact grid + wins / opportunities text. Link to `/sunday-review` for full detail.

### 5. Last Week's Events
Queries `calendar_events` where `start_at` is within the previous 7 days (expanding recurrences the same way `/calendar` does). Lists title, date, leader, sub_calendar. Each row has a "discuss" notes input that saves into the meeting's section notes.

### 6. First Step Cards
External link card → `https://people.planningcenteronline.com/forms/161115` with a "Open in PCO" button + notes textarea.

### 7. Next Step Cards
Same pattern → `https://people.planningcenteronline.com/forms/433638`.

### 8. Review Trends
- Link button → `https://churchmetrics.lovable.app/`
- Embedded "this week's metrics report": file uploader (PDF/XLSX) scoped to the meeting. If a report was uploaded for this meeting's week, it shows as a download chip with uploader + timestamp. Reuses existing `finance-reports` storage bucket pattern but stored in a new `meeting_reports` table (or we reuse `finance_reports` with a `report_type` column — see Technical).
- Notes textarea.

### 9. Review Tasks
Pulls all `action_items` where `completed = false` from ALL meetings (not just today). Groups by `assignee_id` (falls back to "Unassigned"). For each task:
- Checkbox to mark complete
- Assignee dropdown (profiles)
- "Push to Google Tasks" button (stub for now — see Technical)

### 10. Items To Discuss
This is the **existing free-form `agenda_items` list** — kept as-is. Renamed in UI from "Agenda" to "Items To Discuss."

### 11. Upcoming Events
Queries `calendar_events` for the next 60 days (with recurrence expansion). Same row format as Last Week's Events with per-row notes.

### 12. Action Items, Notes, Transcript
Existing sections — kept at the bottom.

## Technical changes

**Database (one migration):**
- New table `meeting_section_notes (meeting_id, section_key, notes, updated_at)` with `UNIQUE(meeting_id, section_key)` — stores per-section devotional/discussion notes. RLS: same as meetings (core + meeting roles).
- New table `meeting_event_notes (meeting_id, event_id, occurrence_date, notes)` — per-event discussion notes within a meeting (for Last Week / Upcoming sections). RLS: same.
- Add `assignee_id` lookup-friendly index on `action_items`.
- `action_items` already has `assignee_id` — good.
- For Review Trends report: add `report_type text default 'finance'` column to `finance_reports` and reuse the bucket. Filter by `report_type='trends'` for the meeting view.

**Frontend (`src/routes/meeting.tsx`):**
- Major rewrite. Break into sub-components in `src/components/meeting/`:
  - `StandingSection.tsx` (collapsible wrapper)
  - `NotesSection.tsx` (Devotional, Lead Like Jesus, link sections)
  - `SundayReviewSection.tsx`
  - `LastWeekEventsSection.tsx` + `UpcomingEventsSection.tsx` (share recurrence expansion helper extracted from `calendar.tsx` into `src/lib/calendar-expand.ts`)
  - `ReviewTrendsSection.tsx` (file upload + link)
  - `ReviewTasksSection.tsx` (cross-meeting open action items, grouped by assignee)
- Keep existing `agenda_items` list as the "Items To Discuss" section.
- Keep existing notes/transcript/action items code.

**Google Tasks push:**
For this turn, render the "Push to Google Tasks" button as a placeholder that shows a toast ("Google Tasks integration coming soon"). Wiring the actual integration requires per-user OAuth (Google Tasks API), which is a separate feature involving connector setup or custom OAuth — flagged as follow-up, not built now.

**Recurrence expansion:**
Extract the existing recurrence/RRULE expansion logic from `calendar.tsx` into a shared helper so both Last Week and Upcoming sections render expanded occurrences correctly.

## Out of scope this turn
- Actual Google Tasks API integration (button is placeholder)
- Editing standing agenda structure from the UI (it's hard-coded — these are *standing* items by definition)
- Backfilling historical meetings with section notes

## Files to create/edit
- migration: section notes + event notes tables, report_type column
- new: `src/lib/calendar-expand.ts`
- new: `src/components/meeting/*.tsx` (6 files)
- edit: `src/routes/meeting.tsx` (restructure)
- edit: `src/routes/calendar.tsx` (use shared expansion helper)
