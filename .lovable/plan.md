## What we're building

1. A new **Ministry Highlight** communication channel on event cards (next to Sunday Announcement).
2. When either **Ministry Highlight** or **Sunday Announcement** is checked on an event, prompt the user to pick one or more Sunday dates to schedule it for. Dates can be added/removed later by reopening the event.
3. A new standing section in the weekly staff meeting — **This Sunday's Slot** — that lists every event scheduled for Ministry Highlight or Sunday Announcement on the Sunday that falls in the meeting's week.

## How it works

### Event card
- Add `{ key: "ministry_highlight", label: "Ministry Highlight" }` to `COMMS_CHANNELS` in `src/routes/calendar.tsx` and a matching entry in `LISTING_CHECKLIST_LABEL`.
- When the user checks Ministry Highlight or Sunday Announcement, open a small inline scheduler underneath the checkbox: a date popover restricted to Sundays, plus a list of already-scheduled Sundays with remove buttons. Multiple Sundays allowed per channel per event. Unchecking the channel clears its dates.
- Saving the event persists those dates to a new table (see below). The scheduled-Sundays UI also appears on read for any already-scheduled event.

### Weekly meeting
- Add a new `StandingSection` titled **This Sunday's Slot** in `src/routes/meeting.tsx`, rendered under "This Week" (next to UpcomingEventsSection).
- It computes the Sunday whose week contains `meeting.meeting_date` (the upcoming Sunday on or after the meeting date) and lists any events scheduled for that Sunday, grouped by channel (Ministry Highlight / Sunday Announcement), each linking back to the event in the calendar.
- Empty state: "Nothing scheduled for this Sunday yet."

## Technical details

### Database (new migration)
New table `public.event_sunday_slots`:
- `id uuid pk`
- `event_id uuid not null` (references `calendar_events.id` via app logic — matches existing pattern of no FKs)
- `channel text not null check (channel in ('ministry_highlight','sunday_announcement'))`
- `sunday_date date not null`
- `created_at timestamptz not null default now()`
- `created_by uuid`
- unique `(event_id, channel, sunday_date)`
- Index on `(sunday_date, channel)` for the meeting lookup.
- `GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_sunday_slots TO authenticated; GRANT ALL ... TO service_role;`
- RLS: authenticated can SELECT all; core role can INSERT/UPDATE/DELETE (mirrors `event_rooms`).

### `src/routes/calendar.tsx`
- Extend `COMMS_CHANNELS` and `LISTING_CHECKLIST_LABEL` with `ministry_highlight`.
- In the comms checkbox rendering blocks (around lines ~1370–1420), when the channel key is `ministry_highlight` or `sunday_announcement` AND the box is checked, render a Sunday-picker subcomponent below the row:
  - shadcn `Popover` + `Calendar` with `mode="single"` and `disabled={(d) => d.getDay() !== 0}` (Sundays only). Selecting a date appends to the list.
  - List of chips for each scheduled Sunday with `X` to remove.
- Add state `sundaySlots: { ministry_highlight: string[]; sunday_announcement: string[] }` loaded from the new table when the event opens and saved alongside the event (diff against initial → inserts + deletes).
- Unchecking the channel clears its slot list.

### `src/routes/meeting.tsx` + `src/components/meeting/MeetingSections.tsx`
- New component `ThisSundaySection({ meetingId, meetingDate })` in `MeetingSections.tsx`:
  - Compute target Sunday = next Sunday on/after `meetingDate` (`addDays(meetingDate, (7 - day) % 7)`).
  - Query `event_sunday_slots` where `sunday_date = targetSunday`, join titles from `calendar_events` (two queries).
  - Render as a `StandingSection` with two sub-lists (Ministry Highlight, Sunday Announcement), each row showing event title + link to `/calendar?event=<id>`.
- Wire it into `src/routes/meeting.tsx` under the "This Week" divider, before `UpcomingEventsSection`.

### Readiness scoring
No change. Sunday slots are scheduling metadata, not readiness checks.

## Out of scope
- Notifications/reminders about upcoming highlight/announcement slots.
- Editing slots from the meeting view (read-only there; edit on the event).
- Exposing slots in the meeting recap email (can add later if useful).