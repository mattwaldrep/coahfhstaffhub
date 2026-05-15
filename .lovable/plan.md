## Goal

Add a public, read-only calendar at `/calendar/public` (no login) that has the same view modes (Month / Week / List) and sub-calendar filter chips as the staff calendar, but no edit controls.

## What you'll get

- Public URL: `https://coahfhstaffhub.lovable.app/calendar/public`
- Same three views: **Month**, **Week**, **List** — toggle in the header
- Same sub-calendar filter chips: Forest Hills Main, COAH:LM, Youth, General (toggle on/off; preference saved in URL/localStorage)
- Same month/week navigation (prev/next/today)
- Click an event → read-only details popup (title, date/time, location, leader, category, sub-calendar, description)
- No "Add event", no edit/delete buttons, no checklist editing, no AppShell sidebar
- Friendly header with church name + small "Staff sign in" link

## Implementation

1. **Refactor — extract a shared read-only viewer**
   - Move the existing `MonthGrid`, `WeekStrip`, `ListView`, the filter chip row, and the view/cursor controls out of `src/routes/calendar.tsx` into `src/components/calendar/CalendarViewer.tsx`.
   - Component takes props: `occurrences`, `view`, `setView`, `cursor`, `setCursor`, `filters`, `setFilters`, `onPickEvent`, `canEdit` (defaults to `false`).
   - When `canEdit` is `false`: hide the "+ New event" affordance, day-cell click does nothing, event click opens a read-only details modal instead of the edit dialog.
   - Staff `/calendar` keeps all current behavior by passing `canEdit={true}` and its existing edit handlers.

2. **New route** `src/routes/calendar.public.tsx`
   - No `AppShell` — a slim public layout (church name header, footer with link to `/login`).
   - Fetches via a new server function (below), runs the same `expandEvents` logic from `src/lib/calendar-expand.ts` for recurrence.
   - Renders `<CalendarViewer canEdit={false} ... />` so it gets identical Month/Week/List + filter chips for free.
   - SEO: route-specific `head()` with title "COAH Forest Hills Calendar", description, og tags.

3. **New server function** `src/lib/public-calendar.functions.ts`
   - `getPublicEvents({ rangeStart, rangeEnd })` — `createServerFn`, no auth middleware.
   - Uses `supabaseAdmin` server-side to bypass RLS.
   - Returns only safe fields needed by the viewer: `id, title, start_at, end_at, sub_calendar, category, leader_name, all_day, rrule, excluded_dates, other_listings, location, description`.
   - Excludes internal-only fields (`readiness`, `action_note`, `room_needed`, `church_covering`, `missions_team_needed`, `pco_registration`, checklists).

4. **Optional**: small "Share public calendar" button on staff `/calendar` that copies the public URL.

## Open questions

1. **All events public, or opt-in per event?** Today every event in `calendar_events` would be visible. Options:
   - (a) All public (simplest, matches current internal SELECT-all behavior)
   - (b) Add an `is_public` boolean column (default `true` or `false` — your call) with a toggle on the event editor
2. **Sub-calendars on the public view**: show all four with chips like staff view (default), or restrict to a subset (e.g. exclude "General" internal stuff)?
3. **URL path**: `/calendar/public` (default), `/public-calendar`, or `/events`?

If you have no preference, defaults will be: (a) all events public, all four sub-calendars with chips, path `/calendar/public`.